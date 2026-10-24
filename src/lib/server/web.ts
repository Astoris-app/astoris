// Built-in read-only web tool for agents ("web_lesen").
// GET only, no cookies or credentials, only hosts on the operator's allowlist
// (constitution.egressWhitelist), SSRF guard on every hop, size and time limits.
// Because it cannot change anything and only reaches operator-approved domains,
// the policy classifies it as 'read' (no per-call approval).
import { guardedFetch } from './sandbox';
import { htmlToText } from './html-text';
import { getConstitution } from './constitution';

const MAX_BYTES = 1_500_000;
const MAX_TEXT = 15_000;
const TIMEOUT_MS = 12_000;

function normDomain(d: string): string {
	return d.trim().toLowerCase().replace(/^\*\./, '').replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/\.$/, '');
}

export function hostAllowed(host: string, allowlist: readonly string[]): boolean {
	const h = host.toLowerCase().replace(/\.$/, '');
	return allowlist.some((entry) => {
		const d = normDomain(entry);
		return !!d && (h === d || h.endsWith('.' + d));
	});
}

export function webAllowlist(): string[] {
	return getConstitution().egressWhitelist.map(normDomain).filter(Boolean);
}

async function readCapped(res: Response): Promise<{ body: string; truncated: boolean }> {
	const reader = res.body?.getReader();
	if (!reader) return { body: '', truncated: false };
	const chunks: Uint8Array[] = [];
	let size = 0;
	let truncated = false;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		size += value.byteLength;
		if (size > MAX_BYTES) { truncated = true; await reader.cancel(); break; }
		chunks.push(value);
	}
	const buf = new Uint8Array(chunks.reduce((n, c) => n + c.byteLength, 0));
	let off = 0;
	for (const c of chunks) { buf.set(c, off); off += c.byteLength; }
	return { body: new TextDecoder('utf-8', { fatal: false }).decode(buf), truncated };
}

export async function readWebPage(rawUrl: unknown, allowlist: readonly string[] = webAllowlist()) {
	let u: URL;
	try { u = new URL(String(rawUrl ?? '').trim()); } catch { return { error: 'Ungültige URL. Bitte eine vollständige https-Adresse angeben.' }; }
	if (u.protocol !== 'https:' && u.protocol !== 'http:') return { error: 'Nur http/https erlaubt.' };
	if (u.username || u.password) return { error: 'URLs mit Zugangsdaten sind nicht erlaubt.' };
	if (!allowlist.length) return { error: 'Keine Lese-Domains freigegeben. Der Betreiber trägt sie in der Konstitution unter egressWhitelist ein.' };
	if (!hostAllowed(u.hostname, allowlist)) return { error: `Domain ${u.hostname} ist nicht freigegeben. Erlaubt: ${allowlist.join(', ')}` };
	const check = (hop: URL) => {
		if (!hostAllowed(hop.hostname, allowlist)) throw new Error(`Weiterleitung auf nicht freigegebene Domain ${hop.hostname}`);
	};
	try {
		const res = await guardedFetch(u.href, {
			method: 'GET',
			headers: { 'user-agent': 'Astoris-WebLesen/1.0 (+https://astoris.org)', accept: 'text/html,application/xhtml+xml,text/plain,application/json;q=0.9,*/*;q=0.1' },
			signal: AbortSignal.timeout(TIMEOUT_MS)
		}, check);
		const type = (res.headers.get('content-type') ?? '').toLowerCase();
		if (!/(text\/|json|xml)/.test(type)) return { url: res.url || u.href, status: res.status, error: `Kein Textinhalt (${type || 'unbekannt'}).` };
		const { body, truncated: cut } = await readCapped(res);
		const isHtml = type.includes('html');
		const title = isHtml ? htmlToText(/<title[^>]*>([\s\S]{0,500}?)<\/title>/i.exec(body)?.[1] ?? '').trim() : '';
		const text = (isHtml ? htmlToText(body) : body).replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
		return { url: res.url || u.href, status: res.status, title, text: text.slice(0, MAX_TEXT),
			truncated: cut || text.length > MAX_TEXT, chars: text.length };
	} catch (e) {
		const msg = e instanceof Error ? (e.name === 'TimeoutError' ? 'Zeitüberschreitung' : e.message) : 'Fehler';
		return { error: `Seite nicht lesbar: ${msg}` };
	}
}
