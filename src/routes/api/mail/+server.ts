import { json } from '@sveltejs/kit';
import { getDecrypted } from '$lib/server/store';
import tls from 'node:tls';

// Raw IMAP over TLS (port 993). No third-party deps — Node builtins only.
// We fetch headers of the last ~15 messages of INBOX and parse From/Subject/Date + UID + seen flag.

const TIMEOUT_MS = 8000;
const FETCH_COUNT = 15;

type Mail = { uid: number; from: string; subject: string; date: string; seen: boolean };

// Escape a string for an IMAP quoted-string literal.
function imapQuote(s: string): string {
	return '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
}

// Decode RFC 2047 encoded-words (=?charset?B?..?= / =?charset?Q?..?=) for header values.
function decodeHeader(value: string): string {
	if (!value) return '';
	return value.replace(/=\?([^?]+)\?([bBqQ])\?([^?]*)\?=/g, (_m, charset: string, enc: string, text: string) => {
		try {
			let bytes: Buffer;
			if (enc.toUpperCase() === 'B') {
				bytes = Buffer.from(text, 'base64');
			} else {
				// Q-encoding: underscores are spaces, =XX are hex bytes.
				const replaced = text.replace(/_/g, ' ').replace(/=([0-9A-Fa-f]{2})/g, (_s, h) => String.fromCharCode(parseInt(h, 16)));
				bytes = Buffer.from(replaced, 'binary');
			}
			const cs = charset.toLowerCase();
			if (cs === 'utf-8' || cs === 'utf8') return bytes.toString('utf8');
			if (cs === 'iso-8859-1' || cs === 'latin1') return bytes.toString('latin1');
			// Best effort fallback.
			try {
				return new TextDecoder(cs as string).decode(bytes);
			} catch {
				return bytes.toString('utf8');
			}
		} catch {
			return text;
		}
	}).replace(/\?=\s+=\?/g, '?==?'); // join adjacent encoded words
}

// Unfold a raw header block and extract a single header field value.
function extractHeader(block: string, name: string): string {
	const lines = block.split(/\r?\n/);
	const lower = name.toLowerCase() + ':';
	let value = '';
	let capturing = false;
	for (const line of lines) {
		if (capturing) {
			if (/^[ \t]/.test(line)) {
				value += ' ' + line.trim();
				continue;
			}
			break;
		}
		if (line.toLowerCase().startsWith(lower)) {
			value = line.slice(name.length + 1).trim();
			capturing = true;
		}
	}
	return decodeHeader(value).trim();
}

function runImap(host: string, email: string, password: string): Promise<Mail[]> {
	return new Promise((resolve, reject) => {
		let settled = false;
		const finish = (err: Error | null, mails?: Mail[]) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			try { socket.destroy(); } catch { /* ignore */ }
			if (err) reject(err);
			else resolve(mails ?? []);
		};

		const timer = setTimeout(() => finish(new Error('Zeitüberschreitung beim Postfach-Abruf.')), TIMEOUT_MS);

		const socket = tls.connect({ host, port: 993, servername: host }, () => {
			// connected; wait for greeting
		});
		socket.setEncoding('utf8');

		let buffer = '';
		// Simple state machine over tagged command responses.
		type Step = 'greet' | 'login' | 'select' | 'fetch';
		let step: Step = 'greet';
		const fetchRaw: string[] = [];

		const send = (line: string) => socket.write(line + '\r\n');

		socket.on('data', (chunk: string) => {
			buffer += chunk;

			if (step === 'greet') {
				if (/\r?\n/.test(buffer)) {
					buffer = '';
					step = 'login';
					send(`a1 LOGIN ${imapQuote(email)} ${imapQuote(password)}`);
				}
				return;
			}

			if (step === 'login') {
				if (/^a1 (OK|NO|BAD)/im.test(buffer)) {
					if (/^a1 OK/im.test(buffer)) {
						buffer = '';
						step = 'select';
						send('a2 SELECT INBOX');
					} else {
						finish(new Error('Anmeldung fehlgeschlagen. Zugangsdaten prüfen.'));
					}
				}
				return;
			}

			if (step === 'select') {
				if (/^a2 (OK|NO|BAD)/im.test(buffer)) {
					if (!/^a2 OK/im.test(buffer)) {
						finish(new Error('INBOX konnte nicht geöffnet werden.'));
						return;
					}
					// Parse total message count from "* <n> EXISTS".
					const m = buffer.match(/\*\s+(\d+)\s+EXISTS/i);
					const total = m ? parseInt(m[1], 10) : 0;
					buffer = '';
					if (!total) {
						finish(null, []);
						return;
					}
					const start = Math.max(1, total - FETCH_COUNT + 1);
					const range = `${start}:${total}`;
					step = 'fetch';
					send(`a3 FETCH ${range} (UID FLAGS BODY.PEEK[HEADER.FIELDS (FROM SUBJECT DATE)])`);
				}
				return;
			}

			if (step === 'fetch') {
				if (/^a3 (OK|NO|BAD)/im.test(buffer)) {
					fetchRaw.push(buffer);
					if (!/^a3 OK/im.test(buffer)) {
						finish(new Error('Nachrichten konnten nicht geladen werden.'));
						return;
					}
					finish(null, parseFetch(fetchRaw.join('')));
				}
			}
		});

		socket.on('error', (e) => finish(e instanceof Error ? e : new Error(String(e))));
		socket.on('close', () => finish(new Error('Verbindung zum Postfach geschlossen.')));
	});
}

// Parse a FETCH response block into Mail records.
function parseFetch(raw: string): Mail[] {
	const mails: Mail[] = [];
	// Each message starts with: * <seq> FETCH (...)
	// Split on the message boundary while keeping payloads.
	const parts = raw.split(/(?:^|\r?\n)\*\s+\d+\s+FETCH\s*\(/);
	// First part is before the first FETCH — drop it, re-prepend marker handling.
	for (let i = 0; i < parts.length; i++) {
		const seg = i === 0 ? '' : parts[i];
		if (!seg) continue;

		const beforeBody = seg.split(/BODY\[/i)[0];
		const uidMatch = beforeBody.match(/UID\s+(\d+)/i);
		const uid = uidMatch ? parseInt(uidMatch[1], 10) : 0;

		const flagsMatch = seg.match(/FLAGS\s*\(([^)]*)\)/i);
		const flags = flagsMatch ? flagsMatch[1] : '';
		const seen = /\\Seen/i.test(flags);

		// Header literal follows BODY[...] {n}\r\n<headers>
		const litMatch = seg.match(/BODY\[[^\]]*\]\s*\{(\d+)\}\r?\n/i);
		let headerBlock = '';
		if (litMatch) {
			const startIdx = (litMatch.index ?? 0) + litMatch[0].length;
			const len = parseInt(litMatch[1], 10);
			headerBlock = seg.slice(startIdx, startIdx + len);
		}

		const from = extractHeader(headerBlock, 'From') || 'Unbekannter Absender';
		const subject = extractHeader(headerBlock, 'Subject') || '(Kein Betreff)';
		const date = extractHeader(headerBlock, 'Date') || '';

		if (uid || headerBlock) mails.push({ uid, from, subject, date, seen });
	}
	// Newest first.
	return mails.reverse();
}

const BODY_TIMEOUT_MS = 10000;

// Fetch the full raw message for a single UID, then extract a readable text body.
function runImapBody(host: string, email: string, secret: string, uid: number): Promise<string> {
	return new Promise((resolve, reject) => {
		let settled = false;
		const finish = (err: Error | null, body?: string) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			try { socket.destroy(); } catch { /* ignore */ }
			if (err) reject(err);
			else resolve(body ?? '');
		};

		const timer = setTimeout(() => finish(new Error('Zeitüberschreitung beim Laden des Nachrichtentexts.')), BODY_TIMEOUT_MS);

		const socket = tls.connect({ host, port: 993, servername: host }, () => {
			// connected; wait for greeting
		});
		socket.setEncoding('binary');

		let buffer = '';
		let allRaw = '';
		type Step = 'greet' | 'login' | 'select' | 'fetch';
		let step: Step = 'greet';

		const send = (line: string) => socket.write(line + '\r\n');

		socket.on('data', (chunk: string) => {
			buffer += chunk;
			allRaw += chunk;

			if (step === 'greet') {
				if (/\r?\n/.test(buffer)) {
					buffer = '';
					step = 'login';
					send(`a1 LOGIN ${imapQuote(email)} ${imapQuote(secret)}`);
				}
				return;
			}

			if (step === 'login') {
				if (/^a1 (OK|NO|BAD)/im.test(buffer)) {
					if (/^a1 OK/im.test(buffer)) {
						buffer = '';
						step = 'select';
						send('a2 SELECT INBOX');
					} else {
						finish(new Error('Anmeldung fehlgeschlagen. Zugangsdaten prüfen.'));
					}
				}
				return;
			}

			if (step === 'select') {
				if (/^a2 (OK|NO|BAD)/im.test(buffer)) {
					if (!/^a2 OK/im.test(buffer)) {
						finish(new Error('INBOX konnte nicht geöffnet werden.'));
						return;
					}
					buffer = '';
					step = 'fetch';
					// UID FETCH with PEEK so we don't flip the \Seen flag.
					send(`a3 UID FETCH ${uid} (BODY.PEEK[])`);
				}
				return;
			}

			if (step === 'fetch') {
				if (/^a3 (OK|NO|BAD)/im.test(buffer)) {
					if (!/^a3 OK/im.test(buffer)) {
						finish(new Error('Nachrichtentext konnte nicht geladen werden.'));
						return;
					}
					finish(null, allRaw); // DBG
				}
			}
		});

		socket.on('error', (e) => finish(e instanceof Error ? e : new Error(String(e))));
		socket.on('close', () => finish(new Error('Verbindung zum Postfach geschlossen.')));
	});
}

// Decode quoted-printable text into a UTF-8 string.
function decodeQuotedPrintable(input: string, charset: string): string {
	// Remove soft line breaks, then decode =XX hex sequences to raw bytes.
	const noSoft = input.replace(/=\r?\n/g, '');
	const bytes: number[] = [];
	for (let i = 0; i < noSoft.length; i++) {
		const ch = noSoft[i];
		if (ch === '=' && i + 2 < noSoft.length && /[0-9A-Fa-f]{2}/.test(noSoft.slice(i + 1, i + 3))) {
			bytes.push(parseInt(noSoft.slice(i + 1, i + 3), 16));
			i += 2;
		} else {
			bytes.push(ch.charCodeAt(0) & 0xff);
		}
	}
	return decodeBytes(Buffer.from(bytes), charset);
}

// Decode a Buffer using the given charset, with best-effort fallback.
function decodeBytes(buf: Buffer, charset: string): string {
	const cs = charset.toLowerCase();
	if (cs === 'utf-8' || cs === 'utf8' || !cs) return buf.toString('utf8');
	if (cs === 'iso-8859-1' || cs === 'latin1') return buf.toString('latin1');
	try {
		return new TextDecoder(cs).decode(buf);
	} catch {
		return buf.toString('utf8');
	}
}

// Roughly strip HTML to readable plain text.
function stripHtml(html: string): string {
	return html
		.replace(/<!--[\s\S]*?-->/g, '')
		.replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
		.replace(/<\/(p|div|h[1-6]|li|tr|table|blockquote)>/gi, '\n')
		.replace(/<br\s*\/?>/gi, '\n')
		.replace(/<[^>]+>/g, '')
		.replace(/&nbsp;/gi, ' ')
		.replace(/&amp;/gi, '&')
		.replace(/&lt;/gi, '<')
		.replace(/&gt;/gi, '>')
		.replace(/&quot;/gi, '"')
		.replace(/&#39;/gi, "'")
		.replace(/&#(\d+);/g, (_m, n) => String.fromCharCode(parseInt(n, 10)))
		.replace(/[ \t]+\n/g, '\n')
		.replace(/\n{3,}/g, '\n\n')
		.trim();
}

// Parse a literal {n} block from a FETCH response into the raw RFC822 message.
function literalPayload(raw: string): string {
	const lit = raw.match(/BODY\[\]\s*\{(\d+)\}\r?\n/i);
	if (lit) {
		const startIdx = (lit.index ?? 0) + lit[0].length;
		const len = parseInt(lit[1], 10);
		return raw.slice(startIdx, startIdx + len);
	}
	// Fallback: strip the tagged status line and FETCH wrapper.
	return raw.replace(/^a3 (OK|NO|BAD)[\s\S]*$/im, '').replace(/^\*\s+\d+\s+FETCH[^\n]*\n/i, '');
}

type MimeMeta = { encoding: string; charset: string; ctype: string; boundary: string };

function parsePartHeaders(headerBlock: string): MimeMeta {
	const ctRaw = extractHeader(headerBlock, 'Content-Type');
	const cteRaw = extractHeader(headerBlock, 'Content-Transfer-Encoding').toLowerCase();
	const ctype = (ctRaw.split(';')[0] || '').trim().toLowerCase();
	const charsetMatch = ctRaw.match(/charset\s*=\s*"?([^";\s]+)"?/i);
	const boundaryMatch = ctRaw.match(/boundary\s*=\s*"?([^";\r\n]+)"?/i);
	return {
		encoding: cteRaw || '7bit',
		charset: charsetMatch ? charsetMatch[1] : 'utf-8',
		ctype: ctype || 'text/plain',
		boundary: boundaryMatch ? boundaryMatch[1].trim() : ''
	};
}

// Decode one MIME part's body according to its transfer encoding.
function decodePart(body: string, meta: MimeMeta): string {
	if (meta.encoding === 'base64') {
		const clean = body.replace(/[^A-Za-z0-9+/=]/g, '');
		return decodeBytes(Buffer.from(clean, 'base64'), meta.charset);
	}
	if (meta.encoding === 'quoted-printable') {
		return decodeQuotedPrintable(body, meta.charset);
	}
	return decodeBytes(Buffer.from(body, 'binary'), meta.charset);
}

// Walk a (possibly multipart) message and return the best readable text body.
function extractTextFromMessage(raw: string): string {
	const sep = raw.match(/\r?\n\r?\n/);
	if (!sep) return raw.trim();
	const headerBlock = raw.slice(0, sep.index ?? 0);
	const meta = parsePartHeaders(headerBlock);
	const body = raw.slice((sep.index ?? 0) + sep[0].length);

	if (meta.ctype.startsWith('multipart/') && meta.boundary) {
		const marker = '--' + meta.boundary;
		const segments = body.split(marker);
		let htmlFallback = '';
		for (const seg of segments) {
			const trimmed = seg.replace(/^\r?\n/, '');
			if (!trimmed || trimmed.startsWith('--')) continue;
			// Preamble/Epilogue (Text ohne MIME-Part-Header) überspringen.
			const hEnd = trimmed.match(/\r?\n\r?\n/);
			const partHeader = hEnd ? trimmed.slice(0, hEnd.index ?? 0) : trimmed;
			if (!/content-type/i.test(partHeader)) continue;
			const partText = extractTextFromMessage(trimmed);
			const partMeta = parsePartHeaders(trimmed.slice(0, (trimmed.match(/\r?\n\r?\n/)?.index ?? 0)));
			if (partMeta.ctype === 'text/plain' && partText.trim()) return partText;
			if (partMeta.ctype === 'text/html' && partText.trim() && !htmlFallback) htmlFallback = partText;
			if (partMeta.ctype.startsWith('multipart/') && partText.trim() && !htmlFallback) htmlFallback = partText;
		}
		return htmlFallback;
	}

	const decoded = decodePart(body, meta);
	if (meta.ctype === 'text/html') return stripHtml(decoded);
	return decoded.trim();
}

function extractBody(raw: string): string {
	const message = literalPayload(raw);
	const text = extractTextFromMessage(message);
	return text.trim() || '(Kein lesbarer Nachrichtentext gefunden.)';
}

export async function GET({ url }) {
	const conn = getDecrypted('email');
	if (!conn) {
		return json({ connected: false, mails: [] });
	}

	const email = conn.plain.email ?? '';
	const host = conn.plain.imap_host ?? '';
	const secret = conn.plain.password ?? '';

	if (!email || !host || !secret) {
		return json({ connected: true, error: 'Verbindung unvollständig konfiguriert.', mails: [] });
	}

	// Single-message body fetch via ?uid=<n>.
	const uidParam = url.searchParams.get('uid');
	if (uidParam) {
		const uid = parseInt(uidParam, 10);
		if (!Number.isInteger(uid) || uid <= 0) {
			return json({ error: 'Ungültige Nachrichten-ID.' }, { status: 400 });
		}
		try {
			const raw = await runImapBody(host, email, secret, uid);
			return json({ body: extractBody(raw) });
		} catch (e) {
			const msg = e instanceof Error ? e.message : 'Nachrichtentext konnte nicht geladen werden.';
			return json({ error: msg }, { status: 502 });
		}
	}

	try {
		const mails = await runImap(host, email, secret);
		return json({ connected: true, mails });
	} catch (e) {
		// Never expose credentials; only a sanitized message.
		const msg = e instanceof Error ? e.message : 'Postfach-Abruf fehlgeschlagen.';
		return json({ connected: true, error: msg, mails: [] });
	}
}
