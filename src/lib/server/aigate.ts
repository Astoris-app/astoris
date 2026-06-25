// aigate — Data-Loss-Prevention für ausgehende Cloud-KI-Requests.
// Scannt Inhalte auf Secrets/Geheimnisse, BEVOR sie an einen Cloud-Anbieter gehen.
// Lokale Modelle (vLLM) sind nicht betroffen — die verlassen den Server ohnehin nicht.
// Konzept: erstes Premium-Add-on (Default-Regeln gratis).

export type DlpHit = { type: string; sample: string };

// Regex-Quellen erkennen typische Geheimnisse (keine echten Schlüssel im Code).
const PATTERNS: { type: string; re: RegExp }[] = [
	{ type: 'API-Schlüssel (sk)', re: /\bsk-(?:ant-)?[a-zA-Z0-9_-]{20,}\b/g },
	{ type: 'AWS-Schlüssel', re: /\bAKIA[0-9A-Z]{16}\b/g },
	{ type: 'GitHub-Token', re: /\bgh[pousr]_[a-zA-Z0-9]{30,}\b/g },
	{ type: 'Google-Schlüssel', re: /\bAIza[0-9A-Za-z_-]{30,}\b/g },
	{ type: 'Slack-Token', re: /\bxox[baprs]-[0-9a-zA-Z-]{10,}\b/g },
	{ type: 'JWT', re: /\beyJ[a-zA-Z0-9_-]{8,}\.[a-zA-Z0-9_-]{8,}\.[a-zA-Z0-9_-]{8,}\b/g },
	{ type: 'Privater Schlüssel', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g },
	{ type: 'IBAN', re: /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/g },
	{ type: 'Kreditkarte', re: /\b(?:\d[ -]?){15,16}\b/g }
];

/** Findet potenzielle Geheimnisse im Text. */
export function scanSecrets(text: string): DlpHit[] {
	const hits: DlpHit[] = [];
	for (const { type, re } of PATTERNS) {
		const m = text.match(re);
		if (m) for (const x of m.slice(0, 3)) hits.push({ type, sample: x.slice(0, 4) + '…' });
	}
	return hits;
}

/** Ersetzt gefundene Geheimnisse durch [REDIGIERT]. */
export function redactSecrets(text: string): { text: string; hits: DlpHit[] } {
	const hits = scanSecrets(text);
	let out = text;
	for (const { re } of PATTERNS) out = out.replace(re, '[REDIGIERT]');
	return { text: out, hits };
}

export type AigateMode = 'off' | 'redact' | 'block';

/** Wendet die aigate-Policy auf Chat-Nachrichten an (nur für Cloud-Ziele aufrufen). */
export function applyAigate<T extends { role: string; content: string }>(
	messages: T[],
	mode: AigateMode
): { messages: T[]; blocked: boolean; hits: DlpHit[] } {
	if (mode === 'off') return { messages, blocked: false, hits: [] };
	const allHits: DlpHit[] = [];
	const out = messages.map((m) => {
		if (typeof m.content !== 'string') return m;
		const { text, hits } = redactSecrets(m.content);
		allHits.push(...hits);
		return mode === 'redact' ? { ...m, content: text } : m;
	});
	if (mode === 'block' && allHits.length) return { messages, blocked: true, hits: allHits };
	return { messages: out, blocked: false, hits: allHits };
}

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const CONFIG = 'data/aigate.json';

/** Aktueller aigate-Modus (Default: redigieren — sicher). */
export function getAigateMode(): AigateMode {
	try {
		if (existsSync(CONFIG)) {
			const m = JSON.parse(readFileSync(CONFIG, 'utf8')).mode;
			if (m === 'off' || m === 'redact' || m === 'block') return m;
		}
	} catch { /* default */ }
	return 'redact';
}
export function setAigateMode(mode: AigateMode) {
	mkdirSync('data', { recursive: true });
	writeFileSync(CONFIG, JSON.stringify({ mode }), { mode: 0o600 });
}
