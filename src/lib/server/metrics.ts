// Kennzahlen (Metrics): manuell gepflegte KPIs mit Verlauf + Trend.
// Persistenz in data/metrics.json (mode 0o600), Muster wie crm.ts / company.ts.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { companyDir } from './companies';

// Pfad der metrics.json der aktiven Firma (data/companies/<id>/metrics.json).
function file(): string {
	return join(companyDir(), 'metrics.json');
}

export type Measurement = { at: string; value: number };
export type Metric = {
	id: string;
	name: string;
	unit?: string;
	category?: string;
	target?: number;
	current: number;
	history: Measurement[];
	createdAt: string;
};

export type Metrics = { metrics: Metric[] };

// Hard cap on stored history points per metric (oldest dropped).
const HISTORY_MAX = 200;

const EMPTY: Metrics = { metrics: [] };

function load(): Metrics {
	const FILE = file();
	if (!existsSync(FILE)) return { metrics: [] };
	try {
		const raw = JSON.parse(readFileSync(FILE, 'utf8'));
		const list = Array.isArray(raw?.metrics) ? raw.metrics : [];
		// Normalize each entry defensively (file may be hand-edited or partial).
		return {
			metrics: list.map((m: any): Metric => ({
				id: typeof m?.id === 'string' ? m.id : randomUUID(),
				name: (m?.name ?? '').toString(),
				unit: m?.unit ? m.unit.toString() : undefined,
				category: m?.category ? m.category.toString() : undefined,
				target: Number.isFinite(Number(m?.target)) && m?.target !== '' && m?.target != null ? Number(m.target) : undefined,
				current: Number.isFinite(Number(m?.current)) ? Number(m.current) : 0,
				history: Array.isArray(m?.history)
					? m.history
							.filter((h: any) => h && Number.isFinite(Number(h.value)))
							.map((h: any): Measurement => ({ at: (h.at ?? '').toString(), value: Number(h.value) }))
					: [],
				createdAt: (m?.createdAt ?? new Date().toISOString()).toString()
			}))
		};
	} catch {
		return { ...EMPTY };
	}
}

function save(m: Metrics) {
	writeFileSync(file(), JSON.stringify(m, null, 2), { mode: 0o600 });
}

export function getMetrics(): Metrics {
	return load();
}

// ---------- Helpers ----------
function str(v: unknown): string {
	return (v ?? '').toString().trim();
}
// Parses a numeric value or undefined if empty/unparseable.
function num(v: unknown): number | undefined {
	if (v === '' || v === null || v === undefined) return undefined;
	const n = Number(v);
	return Number.isFinite(n) ? n : undefined;
}

// ---------- CRUD ----------
export function addMetric(input: {
	name: string;
	unit?: string;
	category?: string;
	target?: number | string;
	current?: number | string;
}): Metric[] {
	const m = load();
	// Seed history with the initial value so the sparkline/trend have something to show.
	const seed = num(input.current);
	const current = seed ?? 0;
	const now = new Date().toISOString();
	m.metrics.push({
		id: randomUUID(),
		name: str(input.name),
		unit: str(input.unit) || undefined,
		category: str(input.category) || undefined,
		target: num(input.target),
		current,
		history: seed === undefined ? [] : [{ at: now, value: current }],
		createdAt: now
	});
	save(m);
	return m.metrics;
}

export function updateMetric(id: string, patch: Partial<Omit<Metric, 'id' | 'createdAt' | 'history' | 'current'>> & { current?: number }): Metric[] {
	const m = load();
	const x = m.metrics.find((e) => e.id === id);
	if (x) {
		if (typeof patch.name === 'string' && patch.name.trim()) x.name = patch.name.trim();
		if ('unit' in patch) x.unit = str(patch.unit) || undefined;
		if ('category' in patch) x.category = str(patch.category) || undefined;
		if ('target' in patch) x.target = num(patch.target);
		// current is normally driven by addMeasurement; editing it here does NOT touch history.
		if ('current' in patch) {
			const c = num(patch.current);
			if (c !== undefined) x.current = c;
		}
	}
	save(m);
	return m.metrics;
}

export function removeMetric(id: string): Metric[] {
	const m = load();
	m.metrics = m.metrics.filter((e) => e.id !== id);
	save(m);
	return m.metrics;
}

// Appends a measurement to history AND sets current = value.
export function addMeasurement(id: string, value: number, at?: string): Metric[] {
	const m = load();
	const x = m.metrics.find((e) => e.id === id);
	const v = num(value);
	if (x && v !== undefined) {
		const stamp = str(at) || new Date().toISOString();
		x.history = [...x.history, { at: stamp, value: v }].slice(-HISTORY_MAX);
		x.current = v;
	}
	save(m);
	return m.metrics;
}
