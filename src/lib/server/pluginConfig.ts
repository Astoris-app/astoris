// Pro-Add-on-Konfiguration (z. B. API-Keys). Verschlüsselt in data/plugin-config.json;
// Secret-Felder zusätzlich als ASTORIS_ADDON_<ID>_<FELD> in .env (safe, per SSH editierbar).
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { encrypt, decrypt } from './crypto';
import { env } from '$env/dynamic/private';
import { mergeEnv, envKeyFor } from './envSync';

const FILE = 'data/plugin-config.json';

function load(): Record<string, Record<string, string>> {
	try { if (existsSync(FILE)) return JSON.parse(readFileSync(FILE, 'utf8')); } catch { /* leer */ }
	return {};
}
function persist(d: Record<string, Record<string, string>>) {
	mkdirSync('data', { recursive: true });
	writeFileSync(FILE, JSON.stringify(d, null, 2), { mode: 0o600 });
}

/** Entschlüsselte Config eines Add-ons; .env-Override hat Vorrang. */
export function getPluginConfig(id: string): Record<string, string> {
	const enc = load()[id] ?? {};
	const out: Record<string, string> = {};
	for (const [k, v] of Object.entries(enc)) {
		const fromEnv = env[envKeyFor('ASTORIS_ADDON', id, k)];
		try { out[k] = fromEnv ?? decrypt(v); } catch { out[k] = fromEnv ?? ''; }
	}
	return out;
}

/** Speichert Config (verschlüsselt); Secret-Felder zusätzlich in .env. */
export function setPluginConfig(id: string, config: Record<string, string>, secretKeys: string[] = []) {
	const all = load();
	all[id] = Object.fromEntries(Object.entries(config).map(([k, v]) => [k, encrypt(String(v))]));
	persist(all);
	const envUpdates: Record<string, string> = {};
	for (const k of secretKeys) if (config[k] != null && config[k] !== '') envUpdates[envKeyFor('ASTORIS_ADDON', id, k)] = String(config[k]);
	if (Object.keys(envUpdates).length) mergeEnv(envUpdates);
}

/** Welche Feld-Keys sind gesetzt (für „gespeichert"-Anzeige ohne Werte preiszugeben). */
export function getPluginConfigKeys(id: string): string[] {
	return Object.keys(load()[id] ?? {});
}
