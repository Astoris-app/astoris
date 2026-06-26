import { json } from '@sveltejs/kit';
import {
	getExperiments,
	addExperiment,
	updateExperiment,
	removeExperiment,
	setEvaluation,
	type Experiment
} from '$lib/server/optimization';
import { getMetrics, type Metric } from '$lib/server/metrics';
import { getCompany, addMemory } from '$lib/server/company';
import { engineChat } from '$lib/server/engine';

// Auth: alle /api-Routen sind in hooks.server.ts session-pflichtig (kein eigener Check nötig).

function str(v: unknown): string {
	return (v ?? '').toString().trim();
}

// Aktueller Stand einer Kennzahl: bevorzugt current, sonst letzter History-Punkt.
function currentValue(m: Metric): number | undefined {
	if (Number.isFinite(m.current)) return m.current;
	const h = m.history;
	if (Array.isArray(h) && h.length) {
		const last = h[h.length - 1];
		if (last && Number.isFinite(last.value)) return last.value;
	}
	return undefined;
}

function fmtVal(v: number | undefined, unit?: string): string {
	if (v == null || !Number.isFinite(v)) return 'unbekannt';
	const n = v.toLocaleString('de-DE', { maximumFractionDigits: 2 });
	if (!unit) return n;
	return unit === '%' ? `${n} %` : `${n} ${unit}`;
}

// Extrahiert eine knappe Learning-Zeile aus der KI-Bewertung.
// Sucht zuerst eine "Learning:"-Markierung, sonst den ersten aussagekräftigen Satz/Absatz.
function extractLearning(text: string): string {
	const clean = (text ?? '').replace(/\r/g, '').trim();
	if (!clean) return '';
	// 1) Explizite Markierung "Learning:", "Lernen:", "Erkenntnis:"
	const lines = clean.split('\n');
	for (const raw of lines) {
		const line = raw.replace(/^[#>*\-\s]+/, '').trim();
		const m = line.match(/^(?:\*\*)?(?:learning|lernen|erkenntnis|gelernt)(?:\*\*)?\s*[:：]\s*(.+)$/i);
		if (m && m[1].trim()) return m[1].replace(/\*\*/g, '').trim().slice(0, 280);
	}
	// 2) Erster nicht-leerer Absatz (ohne Überschrift) als Kurzfassung.
	for (const raw of lines) {
		const line = raw.replace(/^[#>*\-\s]+/, '').replace(/\*\*/g, '').trim();
		if (line.length > 20) return line.slice(0, 280);
	}
	return clean.replace(/\*\*/g, '').slice(0, 280);
}

export async function GET() {
	return json({ experiments: getExperiments() });
}

export async function POST({ request }) {
	const b = await request.json().catch(() => ({}));
	const action = b?.action;
	const id = str(b?.id);

	// ---------- Experiment anlegen ----------
	if (action === 'add-experiment') {
		const title = str(b.title);
		const hypothesis = str(b.hypothesis);
		if (!title) return json({ ok: false, message: 'Bitte einen Titel angeben.', experiments: getExperiments() }, { status: 400 });
		// Verknüpfte Metrik auflösen → Name + Baseline (aktueller Stand) automatisch snapshotten.
		let metricId: string | undefined;
		let metricName: string | undefined;
		let baseline: number | undefined;
		const reqMetric = str(b.metricId);
		if (reqMetric) {
			const m = getMetrics().metrics.find((x) => x.id === reqMetric);
			if (m) {
				metricId = m.id;
				metricName = m.name;
				baseline = currentValue(m);
			}
		}
		const experiments = addExperiment({
			title,
			hypothesis,
			metricId,
			metricName,
			baseline,
			status: 'geplant'
		});
		return json({ ok: true, experiments });
	}

	// ---------- Experiment aktualisieren ----------
	if (action === 'update-experiment') {
		if (!id) return json({ ok: false, message: 'Keine ID.', experiments: getExperiments() }, { status: 400 });
		const patch: Record<string, unknown> = {};
		if ('title' in b) patch.title = str(b.title);
		if ('hypothesis' in b) patch.hypothesis = str(b.hypothesis);
		if ('status' in b) patch.status = str(b.status);
		// Metrik-Verknüpfung ändern → Name + Baseline neu snapshotten.
		if ('metricId' in b) {
			const reqMetric = str(b.metricId);
			if (reqMetric) {
				const m = getMetrics().metrics.find((x) => x.id === reqMetric);
				if (m) {
					patch.metricId = m.id;
					patch.metricName = m.name;
					patch.baseline = currentValue(m);
				} else {
					patch.metricId = undefined;
					patch.metricName = undefined;
					patch.baseline = undefined;
				}
			} else {
				patch.metricId = undefined;
				patch.metricName = undefined;
				patch.baseline = undefined;
			}
		}
		const experiments = updateExperiment(id, patch as Partial<Experiment>);
		return json({ ok: true, experiments });
	}

	// ---------- Experiment entfernen ----------
	if (action === 'remove-experiment') {
		if (!id) return json({ ok: false, message: 'Keine ID.', experiments: getExperiments() }, { status: 400 });
		return json({ ok: true, experiments: removeExperiment(id) });
	}

	// ---------- KI-Auswertung ----------
	if (action === 'evaluate') {
		if (!id) return json({ ok: false, message: 'Keine ID.', experiments: getExperiments() }, { status: 400 });
		const exp = getExperiments().find((e) => e.id === id);
		if (!exp) return json({ ok: false, message: 'Experiment nicht gefunden.', experiments: getExperiments() }, { status: 404 });

		// Verknüpfte Kennzahl + aktuellen Stand ermitteln (read-only aus metrics.ts).
		let metric: Metric | undefined;
		if (exp.metricId) metric = getMetrics().metrics.find((m) => m.id === exp.metricId);
		const unit = metric?.unit;
		const current = metric ? currentValue(metric) : undefined;
		const baseline = exp.baseline;
		const metricLabel = metric?.name || exp.metricName || '';

		// Veränderung der Kennzahl als Klartext.
		let movement = '';
		if (metricLabel) {
			if (baseline != null && current != null) {
				const delta = current - baseline;
				const dir = delta > 0 ? 'gestiegen' : delta < 0 ? 'gesunken' : 'unverändert geblieben';
				movement =
					`Kennzahl „${metricLabel}" ging von ${fmtVal(baseline, unit)} (Baseline zu Experiment-Start) auf aktuell ${fmtVal(current, unit)} — also ${dir}` +
					(delta !== 0 ? ` (Veränderung: ${delta > 0 ? '+' : ''}${delta.toLocaleString('de-DE', { maximumFractionDigits: 2 })}${unit ? ' ' + unit : ''}).` : '.');
			} else if (current != null) {
				movement = `Kennzahl „${metricLabel}" steht aktuell bei ${fmtVal(current, unit)} (keine verlässliche Baseline gespeichert).`;
			} else {
				movement = `Verknüpfte Kennzahl „${metricLabel}" hat keinen auswertbaren Messwert.`;
			}
		} else {
			movement = 'Diesem Experiment ist keine Kennzahl zugeordnet — bewerte qualitativ anhand der Hypothese.';
		}

		const c = getCompany();
		const system =
			`Du bist Optimierungs-Analyst:in${c.name ? ' für ' + c.name : ''}. ` +
			'Bewerte ein Experiment nüchtern und ehrlich anhand der gemessenen Kennzahl. ' +
			'Erfinde keine Zahlen. Wenn die Datenlage dünn ist, sage das klar. ' +
			'Antworte auf Deutsch in knappem Markdown mit genau diesen Abschnitten: ' +
			'**Wirkung** (hat die Maßnahme gewirkt? Bezug auf die Zahlen), ' +
			'**Learning** (ein bis zwei Sätze, was wir daraus lernen), ' +
			'**Nächster Schritt** (eine konkrete Empfehlung). ' +
			'Halte dich kurz.';
		const userPrompt =
			`Experiment: ${exp.title}\n` +
			`Hypothese: ${exp.hypothesis || '(keine angegeben)'}\n` +
			`${movement}\n\n` +
			'Frage: Hat die Maßnahme gewirkt? Was lernen wir daraus? Was ist der nächste Schritt?';

		const res = await engineChat([
			{ role: 'system', content: system },
			{ role: 'user', content: userPrompt }
		]);

		// Skip-on-fail: keine KI verbunden / Engine nicht erreichbar → klare Meldung, nichts speichern.
		if (res.source === 'demo') {
			return json({ ok: false, message: res.reply, experiments: getExperiments() });
		}

		const learning = extractLearning(res.reply);
		const experiments = setEvaluation(id, res.reply, learning);

		// Learning zusätzlich in die Firmen-Memory schreiben (try/catch, darf den Flow nie brechen).
		if (learning) {
			try {
				addMemory({ category: 'experiment', title: exp.title, content: learning });
			} catch { /* memory write must never break the main flow */ }
		}

		return json({ ok: true, result: res.reply, learning, source: res.source, experiments });
	}

	return json({ ok: false, message: 'Unbekannte Aktion.', experiments: getExperiments() }, { status: 400 });
}
