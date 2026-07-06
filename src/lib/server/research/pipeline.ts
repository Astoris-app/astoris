// Deep-Research-Pipeline: aus einer Frage wird ein zitierter Bericht — in nachvollziehbaren
// Schritten. Jeder Schritt liefert ein Fortschritts-Event, damit der Nutzer live mitliest,
// WIE die Antwort entsteht (kein Blackbox-Ergebnis).
//
// Ablauf: Zerlegen → Suchen → Auswählen → Lesen → Prüfen → Bericht.
// KI-Aufrufe laufen tool-frei (engineComplete); Quellen werden SSRF-sicher geladen (fetchPage)
// und vor jedem LLM-Kontakt als DATEN gewrappt (Prompt-Injection-Schutz).

import { engineComplete } from '../engine';
import { guardExternal } from '../promptGuard';
import type { SelectedModel } from '../models';
import { ddgSearch } from './search';
import { fetchPageText } from './fetchPage';
import type { ReportSource } from '../research-reports';

export type DeepDepth = 'schnell' | 'ausgewogen' | 'gruendlich';

type Profile = { queries: number; sources: number; verify: boolean };
const PROFILES: Record<DeepDepth, Profile> = {
	schnell: { queries: 2, sources: 4, verify: false },
	ausgewogen: { queries: 4, sources: 6, verify: true },
	gruendlich: { queries: 5, sources: 8, verify: true }
};

export type ProgressEvent =
	| { type: 'step'; key: string; label: string; status: 'start' | 'done'; detail?: string }
	| { type: 'subqueries'; queries: string[] }
	| { type: 'sources'; sources: { n: number; title: string; url: string }[] }
	| { type: 'report'; markdown: string; sources: ReportSource[]; model: string; depth: DeepDepth }
	| { type: 'error'; message: string };

export type DeepOptions = { depth?: DeepDepth; override?: SelectedModel | null; signal?: AbortSignal };

// --- kleine Helfer ---------------------------------------------------------

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
	const out: R[] = new Array(items.length);
	let idx = 0;
	async function worker() {
		while (idx < items.length) {
			const i = idx++;
			out[i] = await fn(items[i], i);
		}
	}
	await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
	return out;
}

// Ersten JSON-Array/-Objekt-Block aus einer LLM-Antwort herausschneiden (Modelle plaudern gern drumherum).
function extractJson(text: string): unknown {
	const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
	const body = fence ? fence[1] : text;
	const start = body.search(/[[{]/);
	if (start < 0) return null;
	const open = body[start];
	const close = open === '[' ? ']' : '}';
	let depth = 0;
	for (let i = start; i < body.length; i++) {
		if (body[i] === open) depth++;
		else if (body[i] === close && --depth === 0) {
			try { return JSON.parse(body.slice(start, i + 1)); } catch { return null; }
		}
	}
	return null;
}

function domainOf(url: string): string {
	try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}

// Treffer dedupen (exakte URL), max. 2 pro Domain für Quellen-Vielfalt, dann auf K kürzen.
function selectSources(all: { title: string; url: string; snippet: string }[], k: number) {
	const seen = new Set<string>();
	const perDomain = new Map<string, number>();
	const out: { title: string; url: string; snippet: string }[] = [];
	for (const r of all) {
		if (!/^https?:\/\//i.test(r.url) || seen.has(r.url)) continue;
		const d = domainOf(r.url);
		const c = perDomain.get(d) ?? 0;
		if (c >= 2) continue;
		seen.add(r.url);
		perDomain.set(d, c + 1);
		out.push(r);
		if (out.length >= k) break;
	}
	return out;
}

// --- Pipeline --------------------------------------------------------------

export async function* runDeepResearch(query: string, opts: DeepOptions = {}): AsyncGenerator<ProgressEvent> {
	const q = query.trim();
	const depth: DeepDepth = opts.depth && PROFILES[opts.depth] ? opts.depth : 'ausgewogen';
	const prof = PROFILES[depth];
	const override = opts.override ?? null;
	const aborted = () => opts.signal?.aborted;

	if (!q) { yield { type: 'error', message: 'Bitte eine Frage eingeben.' }; return; }

	// 1) ZERLEGEN — Frage in gezielte Suchanfragen aufteilen.
	yield { type: 'step', key: 'plan', label: 'Frage zerlegen', status: 'start' };
	let subqueries: string[] = [];
	try {
		const r = await engineComplete([
			{ role: 'system', content: 'Du bist ein Recherche-Planer. Antworte ausschließlich mit einem JSON-Array von Strings.' },
			{ role: 'user', content: `Zerlege die folgende Frage in ${prof.queries} sich ergänzende, präzise Web-Suchanfragen. Wähle die Sprache passend zum Thema. Nur das JSON-Array, keine Erklärung.\n\nFrage: ${q}` }
		], override);
		const parsed = r.source !== 'demo' ? extractJson(r.reply) : null;
		if (Array.isArray(parsed)) subqueries = parsed.map((s) => String(s).trim()).filter(Boolean).slice(0, prof.queries);
	} catch { /* Fallback unten */ }
	if (!subqueries.length) subqueries = [q]; // Ohne KI-Plan wenigstens die Originalfrage suchen.
	yield { type: 'subqueries', queries: subqueries };
	yield { type: 'step', key: 'plan', label: 'Frage zerlegen', status: 'done', detail: `${subqueries.length} Suchanfragen` };
	if (aborted()) return;

	// 2) SUCHEN — alle Sub-Queries parallel.
	yield { type: 'step', key: 'search', label: 'Quellen suchen', status: 'start' };
	const hitLists = await mapLimit(subqueries, 4, async (sq) => {
		try { return await ddgSearch(sq, 8); } catch { return []; }
	});
	const allHits = hitLists.flat();
	yield { type: 'step', key: 'search', label: 'Quellen suchen', status: 'done', detail: `${allHits.length} Treffer` };
	if (aborted()) return;
	if (!allHits.length) { yield { type: 'error', message: 'Keine Web-Treffer gefunden. Anfrage ggf. umformulieren.' }; return; }

	// 3) AUSWÄHLEN — dedupen, Domain-Vielfalt, Top K.
	yield { type: 'step', key: 'select', label: 'Quellen auswählen', status: 'start' };
	const picked = selectSources(allHits, prof.sources);
	yield { type: 'step', key: 'select', label: 'Quellen auswählen', status: 'done', detail: `${picked.length} Quellen` };
	if (aborted()) return;

	// 4) LESEN — jede Quelle SSRF-sicher laden, Text extrahieren. Fehlversuche fallen raus.
	yield { type: 'step', key: 'read', label: 'Quellen lesen', status: 'start', detail: picked.map((p) => domainOf(p.url)).join(', ') };
	const pages = await mapLimit(picked, 3, async (p) => {
		const res = await fetchPageText(p.url, 3000);
		return { ...p, text: res.ok ? res.text : '', title: res.title || p.title, ok: res.ok };
	});
	const good = pages.filter((p) => p.ok && p.text);
	// Nummerierte Quellenliste (Basis für Fußnoten [n]).
	const sources: ReportSource[] = good.map((p, i) => ({ n: i + 1, title: p.title || domainOf(p.url), url: p.url }));
	yield { type: 'sources', sources: sources.map((s) => ({ n: s.n, title: s.title, url: s.url })) };
	yield { type: 'step', key: 'read', label: 'Quellen lesen', status: 'done', detail: `${good.length} von ${picked.length} gelesen` };
	if (aborted()) return;
	if (!good.length) { yield { type: 'error', message: 'Keine der Quellen war lesbar. Bitte erneut versuchen.' }; return; }

	// Quellen-Auszüge, klar als externe DATEN markiert (Prompt-Injection-Schutz).
	const sourceBlock = good
		.map((p, i) => `--- QUELLE [${i + 1}] ${p.url}\n${guardExternal(p.text, `QUELLE ${i + 1}`).safe}`)
		.join('\n\n');

	// 5) PRÜFEN — Kernaussagen extrahieren und markieren, welche von ≥2 Quellen gestützt sind.
	let verifiedNote = '';
	if (prof.verify) {
		yield { type: 'step', key: 'verify', label: 'Aussagen prüfen', status: 'start' };
		try {
			const r = await engineComplete([
				{ role: 'system', content: 'Du prüfst Quellen für einen Recherchebericht. Antworte ausschließlich mit JSON: {"claims":[{"text":"…","sources":[1,2],"disputed":false}]}.' },
				{ role: 'user', content: `Frage: ${q}\n\nExtrahiere die für die Frage wichtigsten Kernaussagen aus den Quellen. Gib je Aussage an, welche Quellen-Nummern sie stützen (sources) und ob sie zwischen Quellen strittig ist (disputed). Nur belegbare Aussagen.\n\n${sourceBlock}` }
			], override);
			const parsed = r.source !== 'demo' ? (extractJson(r.reply) as { claims?: { text: string; sources: number[]; disputed?: boolean }[] } | null) : null;
			const claims = parsed?.claims ?? [];
			// Quelle gilt als bestätigt, wenn sie eine von ≥2 Quellen gestützte Aussage mitträgt.
			const confirmed = new Set<number>();
			for (const c of claims) {
				const src = Array.isArray(c.sources) ? c.sources : [];
				if (src.length >= 2 && !c.disputed) for (const n of src) confirmed.add(n);
			}
			for (const s of sources) s.verified = confirmed.has(s.n);
			const disputed = claims.filter((c) => c.disputed).length;
			if (claims.length) {
				verifiedNote = `\n\nGeprüfte Kernaussagen (nutze sie als Gerüst, belege im Text mit [n]):\n` +
					claims.map((c) => `- ${c.text} [${(c.sources ?? []).join(', ')}]${c.disputed ? ' (strittig)' : ''}`).join('\n');
			}
			yield { type: 'step', key: 'verify', label: 'Aussagen prüfen', status: 'done', detail: `${claims.length} Aussagen, ${confirmed.size} mehrfach belegt${disputed ? `, ${disputed} strittig` : ''}` };
		} catch {
			yield { type: 'step', key: 'verify', label: 'Aussagen prüfen', status: 'done', detail: 'übersprungen' };
		}
		if (aborted()) return;
	}

	// 6) BERICHT — zitierter Fließtext mit Fußnoten [n].
	yield { type: 'step', key: 'report', label: 'Bericht schreiben', status: 'start' };
	const r = await engineComplete([
		{ role: 'system', content: 'Du bist ein sorgfältiger Rechercheur. Schreibe sachlich auf Deutsch, ausschließlich gestützt auf die bereitgestellten Quellen. Belege Aussagen mit Fußnoten im Format [n] (n = Quellennummer). Erfinde nichts; wenn die Quellen etwas nicht hergeben, sage das.' },
		{ role: 'user', content: `Frage: ${q}\n\nSchreibe einen fundierten, gut gegliederten Bericht in Markdown:\n- Beginne mit einer 2–3 Sätze langen Kurzantwort.\n- Danach Details mit Zwischenüberschriften.\n- Belege konkrete Aussagen mit [n].\n- KEIN Quellenverzeichnis am Ende (wird separat angezeigt).${verifiedNote}\n\n${sourceBlock}` }
	], override);
	if (r.source === 'demo' || !r.reply.trim()) {
		yield { type: 'error', message: 'Die KI ist gerade nicht erreichbar — Bericht konnte nicht erstellt werden. Endpoint unter „Verbindungen" prüfen.' };
		return;
	}
	yield { type: 'step', key: 'report', label: 'Bericht schreiben', status: 'done' };
	yield { type: 'report', markdown: r.reply.trim(), sources, model: r.model ?? 'KI', depth };
}
