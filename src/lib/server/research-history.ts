// Persistente Recherche-Historie. Ein Datensatz pro Suchanfrage in data/research-history.json.
// Single-User (global); bei Multi-Tenancy später pro Workspace trennen.

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const FILE = 'data/research-history.json';

export type ResearchEntry = {
	id: string;
	query: string;
	title?: string;
	at: string;
	favorite: boolean;
	resultCount?: number;
};

function load(): ResearchEntry[] {
	if (!existsSync(FILE)) return [];
	try {
		const raw = JSON.parse(readFileSync(FILE, 'utf8'));
		return Array.isArray(raw) ? (raw as ResearchEntry[]) : [];
	} catch {
		return [];
	}
}

function save(list: ResearchEntry[]) {
	mkdirSync('data', { recursive: true });
	writeFileSync(FILE, JSON.stringify(list, null, 2), { mode: 0o600 });
}

/** Liste für die Sidebar, neueste zuerst. */
export function listHistory(): ResearchEntry[] {
	return load().sort((a, b) => b.at.localeCompare(a.at));
}

/**
 * Suche festhalten. Dedupe: existiert dieselbe (getrimmte) query bereits,
 * werden at + resultCount aktualisiert statt ein Duplikat anzulegen.
 */
export function upsertSearch(input: { query: string; resultCount?: number }): ResearchEntry {
	const query = input.query.replace(/\s+/g, ' ').trim().slice(0, 300);
	const list = load();
	const now = new Date().toISOString();
	const existing = list.find((e) => e.query === query);
	if (existing) {
		existing.at = now;
		if (input.resultCount !== undefined) existing.resultCount = input.resultCount;
		save(list);
		return existing;
	}
	const entry: ResearchEntry = {
		id: randomUUID(),
		query,
		at: now,
		favorite: false,
		...(input.resultCount !== undefined ? { resultCount: input.resultCount } : {})
	};
	list.push(entry);
	save(list);
	return entry;
}

export function renameEntry(id: string, title: string): boolean {
	const list = load();
	const e = list.find((x) => x.id === id);
	if (!e) return false;
	const t = title.replace(/\s+/g, ' ').trim().slice(0, 120);
	if (t) e.title = t;
	else delete e.title;
	save(list);
	return true;
}

export function setFavorite(id: string, fav: boolean): boolean {
	const list = load();
	const e = list.find((x) => x.id === id);
	if (!e) return false;
	e.favorite = fav;
	save(list);
	return true;
}

export function removeEntry(id: string): boolean {
	const list = load();
	const next = list.filter((e) => e.id !== id);
	if (next.length === list.length) return false;
	save(next);
	return true;
}

export function clearHistory(): boolean {
	save([]);
	return true;
}
