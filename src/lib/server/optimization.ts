// Optimierungs-Schleifen: Maßnahme → messen → KI bewertet → Learning.
// Experimente mit Hypothese, verknüpfter Kennzahl, Baseline und KI-Auswertung.
// Persistenz in data/optimization.json (mode 0o600), Muster wie metrics.ts / marketing.ts.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { companyDir } from './companies';

// Pfad der optimization.json der aktiven Firma (data/companies/<id>/optimization.json).
function file(): string {
	return join(companyDir(), 'optimization.json');
}

export type ExperimentStatus = 'geplant' | 'laufend' | 'ausgewertet';
export const EXPERIMENT_STATUS: ExperimentStatus[] = ['geplant', 'laufend', 'ausgewertet'];

export type Experiment = {
	id: string;
	title: string;
	hypothesis: string;
	// Verknüpfte Kennzahl (aus dem Metrics-Modul). Name wird mitgespeichert für read-only Views.
	metricId?: string;
	metricName?: string;
	// Wert der Kennzahl zum Start des Experiments (Vergleichsbasis für die Auswertung).
	baseline?: number;
	status: ExperimentStatus;
	// KI-Bewertung (Markdown) + extrahierte knappe Learning-Zeile.
	result?: string;
	learning?: string;
	createdAt: string;
};

export type Optimization = { experiments: Experiment[] };

const EMPTY: Optimization = { experiments: [] };

function validStatus(v: unknown): ExperimentStatus {
	return EXPERIMENT_STATUS.includes(v as ExperimentStatus) ? (v as ExperimentStatus) : 'geplant';
}

function num(v: unknown): number | undefined {
	if (v === '' || v === null || v === undefined) return undefined;
	const n = Number(v);
	return Number.isFinite(n) ? n : undefined;
}

function str(v: unknown): string {
	return (v ?? '').toString().trim();
}

function load(): Optimization {
	const FILE = file();
	if (!existsSync(FILE)) return { experiments: [] };
	try {
		const raw = JSON.parse(readFileSync(FILE, 'utf8'));
		const list = Array.isArray(raw?.experiments) ? raw.experiments : [];
		// Normalize defensively (file may be hand-edited or partial).
		return {
			experiments: list.map((e: any): Experiment => ({
				id: typeof e?.id === 'string' ? e.id : randomUUID(),
				title: str(e?.title),
				hypothesis: str(e?.hypothesis),
				metricId: e?.metricId ? str(e.metricId) : undefined,
				metricName: e?.metricName ? str(e.metricName) : undefined,
				baseline: num(e?.baseline),
				status: validStatus(e?.status),
				result: e?.result ? e.result.toString() : undefined,
				learning: e?.learning ? e.learning.toString() : undefined,
				createdAt: (e?.createdAt ?? new Date().toISOString()).toString()
			}))
		};
	} catch {
		return { ...EMPTY };
	}
}

function save(o: Optimization) {
	writeFileSync(file(), JSON.stringify(o, null, 2), { mode: 0o600 });
}

export function getExperiments(): Experiment[] {
	return load().experiments;
}

// ---------- CRUD ----------
export function addExperiment(input: {
	title: string;
	hypothesis: string;
	metricId?: string;
	metricName?: string;
	baseline?: number | string;
	status?: ExperimentStatus;
}): Experiment[] {
	const o = load();
	o.experiments.push({
		id: randomUUID(),
		title: str(input.title),
		hypothesis: str(input.hypothesis),
		metricId: str(input.metricId) || undefined,
		metricName: str(input.metricName) || undefined,
		baseline: num(input.baseline),
		status: validStatus(input.status),
		createdAt: new Date().toISOString()
	});
	save(o);
	return o.experiments;
}

export function updateExperiment(
	id: string,
	patch: Partial<Omit<Experiment, 'id' | 'createdAt'>>
): Experiment[] {
	const o = load();
	const x = o.experiments.find((e) => e.id === id);
	if (x) {
		if (typeof patch.title === 'string' && patch.title.trim()) x.title = patch.title.trim();
		if (typeof patch.hypothesis === 'string') x.hypothesis = patch.hypothesis.trim();
		if ('metricId' in patch) x.metricId = str(patch.metricId) || undefined;
		if ('metricName' in patch) x.metricName = str(patch.metricName) || undefined;
		if ('baseline' in patch) x.baseline = num(patch.baseline);
		if (patch.status && EXPERIMENT_STATUS.includes(patch.status)) x.status = patch.status;
		if ('result' in patch) x.result = patch.result ? patch.result.toString() : undefined;
		if ('learning' in patch) x.learning = patch.learning ? patch.learning.toString() : undefined;
	}
	save(o);
	return o.experiments;
}

export function removeExperiment(id: string): Experiment[] {
	const o = load();
	o.experiments = o.experiments.filter((e) => e.id !== id);
	save(o);
	return o.experiments;
}

// Setzt die KI-Auswertung + Learning und markiert das Experiment als ausgewertet.
export function setEvaluation(id: string, result: string, learning: string): Experiment[] {
	const o = load();
	const x = o.experiments.find((e) => e.id === id);
	if (x) {
		x.result = (result ?? '').toString();
		x.learning = (learning ?? '').toString();
		x.status = 'ausgewertet';
	}
	save(o);
	return o.experiments;
}
