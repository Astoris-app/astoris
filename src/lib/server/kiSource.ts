// Bevorzugte KI-Quelle: 'auto' (lokal zuerst), 'local' oder 'cloud' (Cloud zuerst).
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const FILE = 'data/ki-source.json';
export type KiSource = 'auto' | 'local' | 'cloud';
export function getKiSource(): KiSource {
	try {
		if (existsSync(FILE)) {
			const v = JSON.parse(readFileSync(FILE, 'utf8')).source;
			if (v === 'auto' || v === 'local' || v === 'cloud') return v;
		}
	} catch { /* default */ }
	return 'auto';
}
export function setKiSource(s: KiSource) {
	mkdirSync('data', { recursive: true });
	writeFileSync(FILE, JSON.stringify({ source: s }), { mode: 0o600 });
}
