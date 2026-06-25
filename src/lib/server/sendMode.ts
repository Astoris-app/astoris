// Wie die KI ausgehende Nachrichten (Mail/Messenger) versendet:
// 'confirm' = Entwurf, Nutzer bestätigt (Standard) · 'direct' = sofort senden.
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const FILE = 'data/send-mode.json';
export type SendMode = 'confirm' | 'direct';
export function getSendMode(): SendMode {
	try {
		if (existsSync(FILE)) { const v = JSON.parse(readFileSync(FILE, 'utf8')).mode; if (v === 'confirm' || v === 'direct') return v; }
	} catch { /* default */ }
	return 'confirm';
}
export function setSendMode(m: SendMode) {
	mkdirSync('data', { recursive: true });
	writeFileSync(FILE, JSON.stringify({ mode: m }), { mode: 0o600 });
}
