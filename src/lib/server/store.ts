// Persistenz der Verbindungen in data/connections.json.
// Alle Feldwerte werden verschlüsselt abgelegt; der Public-View gibt
// niemals Klartext-Zugangsdaten zurück (nur welche Felder gesetzt sind).

import { existsSync, readFileSync, writeFileSync, mkdirSync, chmodSync } from 'node:fs';
import { encrypt, decrypt } from './crypto';
import { env } from '$env/dynamic/private';

const ENV_FILE = '.env';
function envKey(connectorId: string, fieldKey: string): string {
	return 'ASTORIS_' + connectorId.toUpperCase().replace(/[^A-Z0-9]/g, '_') + '_' + fieldKey.toUpperCase().replace(/[^A-Z0-9]/g, '_');
}
// Spiegelt Credentials zusätzlich (Klartext) in .env — vom Operator gewählt (auch in App änderbar).
function syncToEnv(connectorId: string, fields: Record<string, string>) {
	let lines: string[] = [];
	try { if (existsSync(ENV_FILE)) lines = readFileSync(ENV_FILE, 'utf8').split('\n'); } catch { /* neu */ }
	const updates = new Map<string, string>();
	// Wert escapen, damit Sonderzeichen die .env-Struktur nicht zerschießen (Newlines/Backslash/Quote).
	for (const [k, v] of Object.entries(fields)) updates.set(envKey(connectorId, k), '"' + String(v).replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/"/g, '\\"') + '"');
	const seen = new Set<string>();
	lines = lines.map((line) => {
		const m = line.match(/^([A-Z0-9_]+)=/);
		if (m && updates.has(m[1])) { seen.add(m[1]); return m[1] + '=' + updates.get(m[1]); }
		return line;
	});
	for (const [k, v] of updates) if (!seen.has(k)) lines.push(k + '=' + v);
	try { writeFileSync(ENV_FILE, lines.join('\n'), { mode: 0o600 }); } catch { /* best effort */ }
}

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
	const plain = Object.fromEntries(Object.entries(c.fields).map(([k, v]) => [k, (env[envKey(c.connectorId, k)] ?? decrypt(v))]));
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
	syncToEnv(input.connectorId, input.fields);
	const { fields, ...rest } = rec;
	return { ...rest, fieldKeys: Object.keys(fields) };
}

export function remove(id: string) {
	persist(loadRaw().filter((x) => x.id !== id));
}
