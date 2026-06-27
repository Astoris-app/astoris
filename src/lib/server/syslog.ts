// Systemprotokoll: schlanker Ringpuffer für aussagekräftige Workspace-Ereignisse
// (KI-Läufe, Engine-Aussetzer, Fehler). Persistenz in data/syslog.json, neueste zuerst.
// logEvent darf NIE werfen — Logging ist Nebensache und bricht den Haupt-Flow nie.

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const FILE = 'data/syslog.json';
const MAX = 200;

export type LogLevel = 'info' | 'warn' | 'error';
export type LogEntry = {
	id: string;
	at: string;
	level: LogLevel;
	source: string;
	message: string;
};

const VALID_LEVELS: LogLevel[] = ['info', 'warn', 'error'];

function load(): LogEntry[] {
	if (!existsSync(FILE)) return [];
	try {
		const data = JSON.parse(readFileSync(FILE, 'utf8'));
		return Array.isArray(data) ? (data as LogEntry[]) : [];
	} catch {
		return [];
	}
}

function save(entries: LogEntry[]) {
	mkdirSync('data', { recursive: true });
	writeFileSync(FILE, JSON.stringify(entries, null, 2), { mode: 0o600 });
}

/** Schreibt ein Ereignis (neueste zuerst), trimmt auf MAX. Wirft nie. */
export function logEvent(level: LogLevel, source: string, message: string): void {
	try {
		const lvl: LogLevel = VALID_LEVELS.includes(level) ? level : 'info';
		const entry: LogEntry = {
			id: randomUUID(),
			at: new Date().toISOString(),
			level: lvl,
			source: (source ?? '').toString().slice(0, 60),
			message: (message ?? '').toString().slice(0, 500)
		};
		const entries = [entry, ...load()].slice(0, MAX);
		save(entries);
	} catch {
		/* logging must never break the main flow */
	}
}

/** Alle Einträge, neueste zuerst. */
export function getLog(): LogEntry[] {
	return load();
}

/** Leert das Protokoll. */
export function clearLog(): LogEntry[] {
	try {
		save([]);
	} catch {
		/* ignore */
	}
	return [];
}
