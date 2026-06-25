// Persistenz der Verbindungen in data/connections.json.
// Alle Feldwerte werden verschlüsselt abgelegt; der Public-View gibt
// niemals Klartext-Zugangsdaten zurück (nur welche Felder gesetzt sind).

import { existsSync, readFileSync, writeFileSync, mkdirSync, chmodSync } from 'node:fs';
import { encrypt, decrypt } from './crypto';

const FILE = 'data/connections.json';

export type StoredConnection = {
	id: string;
	connectorId: string;
	createdAt: string;
	scopes: Record<string, boolean>;
	fields: Record<string, string>; // verschlüsselt
	status: 'ok' | 'error' | 'untested';
	lastTest?: string;
};

export type PublicConnection = {
	id: string;
	connectorId: string;
	createdAt: string;
	scopes: Record<string, boolean>;
	status: StoredConnection['status'];
	lastTest?: string;
	fieldKeys: string[];
};

function loadRaw(): StoredConnection[] {
	if (!existsSync(FILE)) return [];
	try {
		return JSON.parse(readFileSync(FILE, 'utf8')) as StoredConnection[];
	} catch {
		return [];
	}
}

function persist(list: StoredConnection[]) {
	mkdirSync('data', { recursive: true });
	try { chmodSync('data', 0o700); } catch { /* best effort */ }
	writeFileSync(FILE, JSON.stringify(list, null, 2), { mode: 0o600 });
}

/** Liste ohne Klartext-Secrets — für die UI. */
export function listPublic(): PublicConnection[] {
	return loadRaw().map((c) => ({
		id: c.id,
		connectorId: c.connectorId,
		createdAt: c.createdAt,
		scopes: c.scopes,
		status: c.status,
		lastTest: c.lastTest,
		fieldKeys: Object.keys(c.fields)
	}));
}

/** Vollständige Verbindung mit entschlüsselten Feldern — nur server-seitig nutzen. */
export function getDecrypted(id: string): (StoredConnection & { plain: Record<string, string> }) | null {
	const c = loadRaw().find((x) => x.id === id);
	if (!c) return null;
	const plain = Object.fromEntries(Object.entries(c.fields).map(([k, v]) => [k, decrypt(v)]));
	return { ...c, plain };
}

export function upsert(input: {
	connectorId: string;
	fields: Record<string, string>;
	scopes: Record<string, boolean>;
	status: StoredConnection['status'];
	lastTest?: string;
}): PublicConnection {
	const list = loadRaw();
	const enc = Object.fromEntries(
		Object.entries(input.fields).map(([k, v]) => [k, encrypt(String(v ?? ''))])
	);
	const idx = list.findIndex((x) => x.id === input.connectorId);
	const rec: StoredConnection = {
		id: input.connectorId,
		connectorId: input.connectorId,
		createdAt: idx >= 0 ? list[idx].createdAt : new Date().toISOString(),
		scopes: input.scopes,
		fields: enc,
		status: input.status,
		lastTest: input.lastTest
	};
	if (idx >= 0) list[idx] = rec;
	else list.push(rec);
	persist(list);
	const { fields, ...rest } = rec;
	return { ...rest, fieldKeys: Object.keys(fields) };
}

export function remove(id: string) {
	persist(loadRaw().filter((x) => x.id !== id));
}
