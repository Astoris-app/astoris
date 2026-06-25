// Plugin-Registry + Loader. Scannt data/plugins/<id>/plugin.json, verwaltet
// Aktivierungs-Status in data/plugins/registry.json. Server-seitig.

import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { PluginManifest, PluginType } from '$lib/plugins/types';

const DIR = 'data/plugins';
const REGISTRY = join(DIR, 'registry.json');

type RegEntry = { enabled: boolean };
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
			m.licensed = m.premium ? false : true; // Premium erst nach Freischaltung (Phase 5)
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
	reg[id] = { enabled };
	saveRegistry(reg);
	return true;
}

/** Aktive Connector-Add-ons (für späteren Erweiterungspunkt in den Verbindungen). */
export function activeConnectorPlugins(): PluginManifest[] {
	return listPlugins().filter((p) => p.type === 'connector' && p.enabled);
}
