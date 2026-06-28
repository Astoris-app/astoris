// Intelligente Voicemail: persistente Anruf-Einträge in data/calls.json.
// Ein Eintrag je Twilio-CallSid (idempotent — Callbacks treffen mehrfach ein).
// Neueste zuerst, hart auf MAX gedeckelt. Speicher-Funktionen werfen nicht
// unkontrolliert; die Webhook-Route fängt Fehler ab und speichert den Anruf
// trotzdem (skip-on-fail bei KI/Benachrichtigung).

import { existsSync, readFileSync, writeFileSync, mkdirSync, chmodSync } from 'node:fs';

const FILE = 'data/calls.json';
const MAX = 200;

export type Urgency = 'hoch' | 'mittel' | 'niedrig';
export const URGENCIES: Urgency[] = ['hoch', 'mittel', 'niedrig'];

export type Call = {
	id: string; // = Twilio CallSid (stabil, idempotent)
	from: string;
	to: string;
	at: string; // ISO — erster Kontakt (Aufnahme abgeschlossen)
	durationSec: number;
	recordingUrl: string;
	transcript: string;
	summary: string;
	urgency: Urgency | '';
	read: boolean;
	notified: boolean;
};

function load(): Call[] {
	if (!existsSync(FILE)) return [];
	try {
		const data = JSON.parse(readFileSync(FILE, 'utf8'));
		return Array.isArray(data) ? (data as Call[]) : [];
	} catch {
		return [];
	}
}

function persist(list: Call[]) {
	mkdirSync('data', { recursive: true });
	try { chmodSync('data', 0o700); } catch { /* best effort */ }
	writeFileSync(FILE, JSON.stringify(list.slice(0, MAX), null, 2), { mode: 0o600 });
}

export function getCalls(): Call[] {
	return load();
}

export function getCall(id: string): Call | null {
	return load().find((c) => c.id === id) ?? null;
}

/**
 * Legt einen Anruf an oder führt einen vorhandenen (per CallSid) zusammen.
 * Nur übergebene Felder werden überschrieben — Callbacks dürfen sich ergänzen.
 */
export function upsertCall(id: string, patch: Partial<Omit<Call, 'id'>>): Call {
	const list = load();
	const idx = list.findIndex((c) => c.id === id);
	if (idx >= 0) {
		const merged = { ...list[idx], ...patch, id };
		list[idx] = merged;
		persist(list);
		return merged;
	}
	const rec: Call = {
		id,
		from: patch.from ?? '',
		to: patch.to ?? '',
		at: patch.at ?? new Date().toISOString(),
		durationSec: patch.durationSec ?? 0,
		recordingUrl: patch.recordingUrl ?? '',
		transcript: patch.transcript ?? '',
		summary: patch.summary ?? '',
		urgency: patch.urgency ?? '',
		read: patch.read ?? false,
		notified: patch.notified ?? false
	};
	persist([rec, ...list]);
	return rec;
}

export function markRead(id: string): Call[] {
	const list = load();
	const c = list.find((x) => x.id === id);
	if (c) { c.read = true; persist(list); }
	return load();
}

export function removeCall(id: string): Call[] {
	persist(load().filter((c) => c.id !== id));
	return load();
}
