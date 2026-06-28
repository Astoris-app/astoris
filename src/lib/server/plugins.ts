// Plugin-Registry + Loader. Scannt data/plugins/<id>/plugin.json, verwaltet
// Aktivierungs-Status in data/plugins/registry.json. Server-seitig.

import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { PluginManifest, PluginType } from '$lib/plugins/types';

const DIR = 'data/plugins';
const REGISTRY = join(DIR, 'registry.json');

type RegEntry = { enabled?: boolean; licensed?: boolean };
function loadRegistry(): Record<string, RegEntry> {
	if (!existsSync(REGISTRY)) return {};
	try { return JSON.parse(readFileSync(REGISTRY, 'utf8')); } catch { return {}; }
}
function saveRegistry(r: Record<string, RegEntry>) {
	mkdirSync(DIR, { recursive: true });
	writeFileSync(REGISTRY, JSON.stringify(r, null, 2), { mode: 0o600 });
}

function validate(m: any): m is PluginManifest {
	const types: PluginType[] = ['connector', 'agent-tool', 'app'];
	return (
		m && typeof m.id === 'string' && /^[a-z0-9][a-z0-9-]{1,40}$/.test(m.id) &&
		typeof m.name === 'string' && typeof m.version === 'string' && types.includes(m.type)
	);
}

/** Alle gefundenen Add-ons mit Aktivierungs-Status. */
export function listPlugins(): PluginManifest[] {
	if (!existsSync(DIR)) return [];
	const reg = loadRegistry();
	const out: PluginManifest[] = [];
	for (const entry of readdirSync(DIR, { withFileTypes: true })) {
		if (!entry.isDirectory()) continue;
		const file = join(DIR, entry.name, 'plugin.json');
		if (!existsSync(file)) continue;
		try {
			const m = JSON.parse(readFileSync(file, 'utf8'));
			if (!validate(m)) continue;
			m.enabled = reg[m.id]?.enabled ?? false;
			m.licensed = m.premium ? Boolean(reg[m.id]?.licensed) : true; // Premium: Freischaltung über Registry (Betreiber)
			out.push(m);
		} catch { /* ungültiges Manifest überspringen */ }
	}
	return out;
}

export function setPluginEnabled(id: string, enabled: boolean): boolean {
	const all = listPlugins();
	const found = all.find((p) => p.id === id);
	if (!found) return false;
	if (found.premium && !found.licensed && enabled) return false; // Premium ohne Lizenz
	const reg = loadRegistry();
	reg[id] = { ...reg[id], enabled };
	saveRegistry(reg);
	return true;
}

/** Premium-Add-on freischalten/sperren (Betreiber-Lizenz). Danach ist es aktivierbar. */
export function setPluginLicensed(id: string, licensed: boolean): boolean {
	const reg = loadRegistry();
	reg[id] = { ...reg[id], licensed };
	saveRegistry(reg);
	return true;
}

/** Aktive Connector-Add-ons (für späteren Erweiterungspunkt in den Verbindungen). */
export function activeConnectorPlugins(): PluginManifest[] {
	return listPlugins().filter((p) => p.type === 'connector' && p.enabled);
}

import type { ConnectorManifest } from '$lib/plugins/types';
import { rmSync } from 'node:fs';

const MAX_FIELDS = 12;

/** Strikte Validierung eines hochgeladenen Connector-Manifests (reine DATEN, kein Code). */
function validConnector(raw: unknown): raw is ConnectorManifest {
	const m = raw as Record<string, any>;
	if (!m || typeof m.id !== 'string' || !/^[a-z0-9][a-z0-9-]{1,40}$/.test(m.id)) return false;
	if (typeof m.name !== 'string' || typeof m.version !== 'string' || m.type !== 'connector') return false;
	if (!Array.isArray(m.fields) || m.fields.length === 0 || m.fields.length > MAX_FIELDS) return false;
	const ftypes = ['text', 'password', 'url'];
	for (const f of m.fields) {
		if (!f || typeof f.key !== 'string' || !/^[a-z0-9_]{1,30}$/.test(f.key)) return false;
		if (typeof f.label !== 'string' || !ftypes.includes(f.type)) return false;
	}
	if (!Array.isArray(m.scopes)) return false;
	for (const sc of m.scopes) {
		if (!sc || typeof sc.id !== 'string' || typeof sc.label !== 'string') return false;
	}
	if (m.test) {
		if (!['http', 'none'].includes(m.test.kind)) return false;
		if (m.test.path && (typeof m.test.path !== 'string' || m.test.path.includes('..'))) return false;
	}
	return true;
}

/** Installiert ein hochgeladenes Connector-Add-on (nur Daten). Wirft bei Ungültigkeit. */
export function installConnectorPlugin(raw: unknown): ConnectorManifest {
	const m = raw as any;
	if (!validConnector(m)) throw new Error('Ungültiges Connector-Add-on (Schema).');
	// nur erlaubte Felder übernehmen (keine versteckten Eigenschaften)
	const clean: ConnectorManifest = {
		id: m.id, name: m.name, version: m.version, type: 'connector',
		author: m.author, premium: Boolean(m.premium), description: m.description, icon: m.icon,
		fields: m.fields, scopes: m.scopes, test: m.test
	};
	const dir = join(DIR, clean.id);
	mkdirSync(dir, { recursive: true });
	writeFileSync(join(dir, 'plugin.json'), JSON.stringify(clean, null, 2), { mode: 0o600 });
	return clean;
}

export function removePlugin(id: string): boolean {
	if (!/^[a-z0-9][a-z0-9-]{1,40}$/.test(id)) return false;
	const dir = join(DIR, id);
	if (!existsSync(dir)) return false;
	rmSync(dir, { recursive: true, force: true });
	const reg = loadRegistry();
	delete reg[id];
	saveRegistry(reg);
	return true;
}

/** Aktive Connector-Add-ons als vollständige Manifeste (für die Verbindungen-Seite). */
export function getConnectorManifests(): ConnectorManifest[] {
	const reg = loadRegistry();
	const out: ConnectorManifest[] = [];
	if (!existsSync(DIR)) return out;
	for (const entry of readdirSync(DIR, { withFileTypes: true })) {
		if (!entry.isDirectory()) continue;
		const file = join(DIR, entry.name, 'plugin.json');
		if (!existsSync(file)) continue;
		try {
			const m = JSON.parse(readFileSync(file, 'utf8'));
			if (validConnector(m) && reg[m.id]?.enabled) out.push(m);
		} catch { /* skip */ }
	}
	return out;
}

import type { CodeManifest } from '$lib/plugins/types';

const MAX_CODE = 50000;
const MAX_WEBSITE = 300;

/** Akzeptiert nur http(s)-URLs (≤300 Zeichen). Sonst undefined (= Feld weglassen). */
function cleanWebsite(raw: unknown): string | undefined {
	if (typeof raw !== 'string') return undefined;
	const s = raw.trim();
	if (!s || s.length > MAX_WEBSITE || !/^https?:\/\//i.test(s)) return undefined;
	try { new URL(s); } catch { return undefined; }
	return s;
}

function validCode(raw: unknown): raw is CodeManifest {
	const m = raw as Record<string, any>;
	if (!m || typeof m.id !== 'string' || !/^[a-z0-9][a-z0-9-]{1,40}$/.test(m.id)) return false;
	if (typeof m.name !== 'string' || typeof m.version !== 'string' || m.type !== 'agent-tool') return false;
	if (typeof m.code !== 'string' || m.code.length === 0 || m.code.length > MAX_CODE) return false;
	return true;
}

/** Installiert ein Code-Add-on (ausführbarer Code). Wirft bei Ungültigkeit. */
export function installCodePlugin(raw: unknown): CodeManifest {
	const m = raw as any;
	if (!validCode(m)) throw new Error('Ungültiges Code-Add-on (Schema oder Code zu groß).');
	const clean: CodeManifest = {
		id: m.id, name: m.name, version: m.version, type: 'agent-tool',
		author: m.author, premium: Boolean(m.premium), description: m.description, icon: m.icon,
		code: m.code, inputHint: m.inputHint, configFields: Array.isArray(m.configFields) ? m.configFields : undefined,
		website: cleanWebsite(m.website)
	};
	const dir = join(DIR, clean.id);
	mkdirSync(dir, { recursive: true });
	writeFileSync(join(dir, 'plugin.json'), JSON.stringify(clean, null, 2), { mode: 0o600 });
	return clean;
}

/** Liest ein Add-on-Manifest (für den In-App-Editor). */
export function getPlugin(id: string): PluginManifest | null {
	if (!/^[a-z0-9][a-z0-9-]{1,40}$/.test(id)) return null;
	const file = join(DIR, id, 'plugin.json');
	if (!existsSync(file)) return null;
	try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return null; }
}

/** Speichert geänderten Code eines Code-Add-ons (In-App-Editor). */
export function saveCodePlugin(id: string, code: string, website?: unknown): boolean {
	if (typeof code !== 'string' || code.length === 0 || code.length > MAX_CODE) return false;
	const m = getPlugin(id) as any;
	if (!m || m.type !== 'agent-tool') return false;
	m.code = code;
	// website nur anfassen, wenn der Client das Feld mitgeschickt hat (sonst unverändert lassen).
	if (website !== undefined) {
		const w = cleanWebsite(website);
		if (w) m.website = w; else delete m.website;
	}
	writeFileSync(join(DIR, id, 'plugin.json'), JSON.stringify(m, null, 2), { mode: 0o600 });
	return true;
}
