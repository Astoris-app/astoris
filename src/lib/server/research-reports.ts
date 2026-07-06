// Persistente Deep-Research-Reports. Ein Datensatz pro abgeschlossener Recherche in
// data/research-reports.json. Single-User (global); bei Multi-Tenancy später pro Workspace trennen.

import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const FILE = 'data/research-reports.json';
const MAX_REPORTS = 200; // Ältere Reports rollen raus — Datei bleibt handlich.

export type ReportSource = {
	n: number; // Fußnoten-Nummer [n]
	title: string;
	url: string;
	verified?: boolean; // wurde die Quelle in der Prüf-Stufe bestätigt?
};

export type ResearchReport = {
	id: string;
	query: string;
	markdown: string; // Report-Text mit [n]-Fußnoten
	sources: ReportSource[];
	model: string;
	depth: string;
	at: string;
};

function load(): ResearchReport[] {
	if (!existsSync(FILE)) return [];
	try {
		const raw = JSON.parse(readFileSync(FILE, 'utf8'));
		return Array.isArray(raw) ? (raw as ResearchReport[]) : [];
	} catch {
		return [];
	}
}

// Atomar schreiben (tmp + rename), damit ein Absturz mitten im Write die Datei nicht zerlegt.
function save(list: ResearchReport[]) {
	mkdirSync('data', { recursive: true });
	const tmp = FILE + '.tmp';
	writeFileSync(tmp, JSON.stringify(list, null, 2), { mode: 0o600 });
	renameSync(tmp, FILE);
}

/** Report speichern (neueste zuerst), begrenzt auf MAX_REPORTS. */
export function saveReport(input: Omit<ResearchReport, 'id' | 'at'>): ResearchReport {
	const list = load();
	const report: ResearchReport = { id: randomUUID(), at: new Date().toISOString(), ...input };
	list.unshift(report);
	if (list.length > MAX_REPORTS) list.length = MAX_REPORTS;
	save(list);
	return report;
}

export function listReports(): ResearchReport[] {
	return load();
}

export function getReport(id: string): ResearchReport | null {
	return load().find((r) => r.id === id) ?? null;
}

export function removeReport(id: string): boolean {
	const list = load();
	const next = list.filter((r) => r.id !== id);
	if (next.length === list.length) return false;
	save(next);
	return true;
}
