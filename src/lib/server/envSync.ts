// Generisches, sicheres Schreiben von Schlüssel/Wert-Paaren in .env (Klartext, gitignored).
// Wiederverwendet von Verbindungen (store.ts) und Add-on-Config.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const ENV_FILE = '.env';

export function envKeyFor(prefix: string, scope: string, field: string): string {
	const norm = (x: string) => x.toUpperCase().replace(/[^A-Z0-9]/g, '_');
	return `${prefix}_${norm(scope)}_${norm(field)}`;
}

/** Schreibt/aktualisiert die gegebenen ENV-Variablen in .env, erhält den Rest. */
export function mergeEnv(updates: Record<string, string>) {
	let lines: string[] = [];
	try { if (existsSync(ENV_FILE)) lines = readFileSync(ENV_FILE, 'utf8').split('\n'); } catch { /* neu */ }
	const upd = new Map<string, string>();
	for (const [k, v] of Object.entries(updates)) {
		const esc = String(v).replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/"/g, '\\"');
		upd.set(k, '"' + esc + '"');
	}
	const seen = new Set<string>();
	lines = lines.map((line) => {
		const m = line.match(/^([A-Z0-9_]+)=/);
		if (m && upd.has(m[1])) { seen.add(m[1]); return m[1] + '=' + upd.get(m[1]); }
		return line;
	});
	for (const [k, v] of upd) if (!seen.has(k)) lines.push(k + '=' + v);
	try { writeFileSync(ENV_FILE, lines.join('\n'), { mode: 0o600 }); } catch { /* best effort */ }
}
