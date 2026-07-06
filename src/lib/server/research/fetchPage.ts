// Lädt eine Web-Quelle für die Deep-Research-Pipeline und macht daraus sauberen Text.
// Nutzt den vorhandenen SSRF-Schutz (safeFetch aus sandbox.ts) — kein zweiter Netzwerk-Pfad.
// Fremd-Inhalt wird NICHT ausgewertet, nur als Text extrahiert; das Wrappen als DATEN
// (Prompt-Injection-Schutz) passiert in der Pipeline vor dem LLM-Aufruf.

import { safeFetch } from '../sandbox';

export type PageResult = {
	url: string;
	title: string;
	text: string;
	ok: boolean;
	error?: string;
};

const MAX_BYTES = 600_000; // ~600 KB Rohtext reichen; verhindert Speicher-/Zeitfresser.

// HTML → lesbarer Text: Script/Style/Nav-Rauschen raus, Tags weg, Entities dekodieren.
function htmlToText(html: string): string {
	let s = html
		.replace(/<script[\s\S]*?<\/script>/gi, ' ')
		.replace(/<style[\s\S]*?<\/style>/gi, ' ')
		.replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
		.replace(/<!--[\s\S]*?-->/g, ' ')
		.replace(/<(nav|header|footer|aside)[\s\S]*?<\/\1>/gi, ' ');
	// Blockelemente in Zeilenumbrüche wandeln, damit Absätze erhalten bleiben.
	s = s.replace(/<\/(p|div|li|h[1-6]|tr|section|article|br)>/gi, '\n');
	s = s.replace(/<[^>]*>/g, ' ');
	s = decodeEntities(s);
	// Whitespace normalisieren, aber Absätze behalten.
	s = s.replace(/[ \t\f\v]+/g, ' ').replace(/\n\s*\n\s*/g, '\n\n').replace(/^\s+|\s+$/gm, '');
	return s.trim();
}

function decodeEntities(s: string): string {
	return s
		.replace(/&amp;/g, '&')
		.replace(/&quot;/g, '"')
		.replace(/&#x27;/g, "'")
		.replace(/&#39;/g, "'")
		.replace(/&apos;/g, "'")
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, n) => {
			try { return String.fromCodePoint(Number(n)); } catch { return ' '; }
		});
}

function extractTitle(html: string): string {
	const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
	return m ? decodeEntities(m[1].replace(/\s+/g, ' ')).trim().slice(0, 200) : '';
}

/**
 * Holt eine Seite SSRF-sicher und gibt gekürzten Klartext zurück.
 * Wirft nie — Fehler landen als { ok:false, error } (die Pipeline überspringt die Quelle dann).
 */
export async function fetchPageText(url: string, maxChars = 3000, timeoutMs = 12_000): Promise<PageResult> {
	const ctrl = new AbortController();
	const t = setTimeout(() => ctrl.abort(), timeoutMs);
	try {
		const res = await safeFetch(url, {
			signal: ctrl.signal,
			headers: {
				'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:124.0) Gecko/20100101 Firefox/124.0',
				Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
				'Accept-Language': 'de-DE,de;q=0.9,en;q=0.8'
			}
		});
		if (!res.ok) return { url, title: '', text: '', ok: false, error: `Status ${res.status}` };
		const ctype = (res.headers.get('content-type') || '').toLowerCase();
		if (!ctype.includes('html') && !ctype.includes('text/plain')) {
			return { url, title: '', text: '', ok: false, error: `Kein Text-Inhalt (${ctype || 'unbekannt'})` };
		}
		// Nur bis MAX_BYTES lesen — große/streamende Seiten nicht komplett schlucken.
		const reader = res.body?.getReader();
		if (!reader) {
			const raw = (await res.text()).slice(0, MAX_BYTES);
			return finalize(url, raw, maxChars);
		}
		const dec = new TextDecoder();
		let raw = '';
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			raw += dec.decode(value, { stream: true });
			if (raw.length >= MAX_BYTES) { try { await reader.cancel(); } catch { /* egal */ } break; }
		}
		return finalize(url, raw, maxChars);
	} catch (e) {
		const aborted = e instanceof Error && e.name === 'AbortError';
		return { url, title: '', text: '', ok: false, error: aborted ? 'Zeitüberschreitung' : (e instanceof Error ? e.message : 'Fetch-Fehler') };
	} finally {
		clearTimeout(t);
	}
}

function finalize(url: string, raw: string, maxChars: number): PageResult {
	const title = extractTitle(raw);
	let text = htmlToText(raw);
	if (text.length > maxChars) text = text.slice(0, maxChars) + ' …';
	if (!text) return { url, title, text: '', ok: false, error: 'Kein lesbarer Text extrahiert' };
	return { url, title, text, ok: true };
}
