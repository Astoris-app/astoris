// Eingeschränkter Ausführungs-Kontext für Code-Add-ons (node:vm).
// Verfügbar: gehärtetes fetch (SSRF-Schutz) + sichere Utility-Web-APIs (btoa/atob/crypto/TextEncoder/URL).
// Kein require/process/fs — kein Datei-/Prozess-/Modulzugriff.
// Kein vollständiger Sicherheits-Sandbox; nur für Self-Host-Code des Betreibers gedacht.

import { spawn } from 'node:child_process';
import dns from 'node:dns/promises';
import net from 'node:net';

export type CodeRunResult = { ok: boolean; output?: unknown; error?: string };

// SSRF-Schutz: private/Loopback/Link-Local-Adressen sperren (inkl. Cloud-Metadata 169.254.x).
function isPrivateIp(ip: string): boolean {
	if (net.isIPv4(ip)) {
		if (/^127\./.test(ip) || /^10\./.test(ip) || /^192\.168\./.test(ip) || /^169\.254\./.test(ip) || /^0\./.test(ip)) return true;
		if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return true;
		return false;
	}
	const low = ip.toLowerCase().replace(/^::ffff:/, '');
	if (net.isIPv4(low)) return isPrivateIp(low); // IPv4-mapped IPv6
	return low === '::1' || low.startsWith('fe80:') || low.startsWith('fc') || low.startsWith('fd');
}

async function assertPublic(rawUrl: string): Promise<void> {
	let u: URL;
	try {
		u = new URL(rawUrl);
	} catch {
		throw new Error('Ungültige URL');
	}
	if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('Nur http/https erlaubt');
	const host = u.hostname.replace(/^\[|\]$/g, '');
	if (host === 'localhost' || host.endsWith('.localhost')) throw new Error('Zugriff auf interne Adressen blockiert');
	if (net.isIP(host)) {
		if (isPrivateIp(host)) throw new Error('Zugriff auf interne Adressen blockiert');
		return;
	}
	const addrs = await dns.lookup(host, { all: true });
	for (const a of addrs) if (isPrivateIp(a.address)) throw new Error('Zugriff auf interne Adressen blockiert');
}

// Gehärtetes fetch für Add-ons: prüft jede Ziel-URL (auch jede Weiterleitung) gegen private Netze.
export async function guardedFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
	let url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url;
	for (let hop = 0; hop < 5; hop++) {
		await assertPublic(url);
		const res = await fetch(url, { ...init, redirect: 'manual', signal: init?.signal ?? AbortSignal.timeout(5000) });
		if (res.status >= 300 && res.status < 400) {
			const loc = res.headers.get('location');
			if (loc) {
				url = new URL(loc, url).href;
				continue;
			}
		}
		return res;
	}
	throw new Error('Zu viele Weiterleitungen');
}

// A disposable child has no inherited secrets, filesystem grants, subprocess grants,
// or access to the parent's objects. All normal network requests go through the parent.
// This protects server availability; it is NOT a hostile-code/multi-tenant security boundary.
const WORKER_SOURCE = String.raw`
import vm from 'node:vm';
import { createInterface } from 'node:readline';
let next = 0;
const requests = new Map();
const send = (message) => process.stdout.write(JSON.stringify(message) + '\n');
async function remoteFetch(input, init) {
	const req = new Request(input, init);
	const body = ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.from(await req.arrayBuffer()).toString('base64');
	if (body && body.length > 350000) throw new Error('Anfrage zu groß.');
	const id = ++next;
	return new Promise((resolve, reject) => {
		requests.set(id, { resolve, reject });
		send({ type: 'fetch', id, url: req.url, method: req.method, headers: Object.fromEntries(req.headers), body });
	});
}
const lines = createInterface({ input: process.stdin });
let started = false;
lines.on('line', async (line) => {
	try {
		const data = JSON.parse(line);
		if (data.type === 'response') {
			const pending = requests.get(data.id); if (!pending) return;
			requests.delete(data.id);
			if (data.error) pending.reject(new Error(data.error));
			else pending.resolve(new Response([204, 205, 304].includes(data.status) ? null : Buffer.from(data.body, 'base64'), { status: data.status, headers: data.headers }));
			return;
		}
		if (started || data.type !== 'run') return;
		started = true;
		const context = vm.createContext({ fetch: remoteFetch, console: { log() {} }, btoa, atob, TextEncoder, TextDecoder,
			URL, URLSearchParams, crypto, FormData, Blob, Uint8Array, input: data.input },
			{ name: 'astoris-addon', codeGeneration: { strings: false, wasm: false } });
		const script = new vm.Script('(async () => {\n' + data.code + '\nif (typeof run !== "function") throw new Error("Code muss run(input) definieren."); return await run(input); })()');
		const output = await script.runInContext(context, { timeout: data.timeout });
		send({ type: 'result', ok: true, output });
	} catch (e) { send({ type: 'result', ok: false, error: e instanceof Error ? e.message : 'Ausführungsfehler' }); }
});
`;

let activeChildren = 0;
export async function runCodeAddon(code: string, input: unknown, timeoutMs = 5000): Promise<CodeRunResult> {
	if (activeChildren >= 4) return { ok: false, error: 'Maximal vier Add-ons gleichzeitig. Bitte erneut versuchen.' };
	if (Buffer.byteLength(code) > 128000) return { ok: false, error: 'Add-on-Code zu groß.' };
	let payload: string;
	try { payload = JSON.stringify({ type: 'run', code, input, timeout: Math.max(100, Math.min(30000, timeoutMs)) }); }
	catch { return { ok: false, error: 'Eingabe ist nicht JSON-kompatibel.' }; }
	if (Buffer.byteLength(payload) > 512000) return { ok: false, error: 'Add-on-Eingabe zu groß.' };
	activeChildren++;
	try {
		return await new Promise<CodeRunResult>((resolve) => {
			const controller = new AbortController();
			const child = spawn(process.execPath, ['--max-old-space-size=64', '--experimental-permission', '--input-type=module', '--eval', WORKER_SOURCE], {
				env: { NODE_ENV: 'production' }, stdio: ['pipe', 'pipe', 'pipe']
			});
			let settled = false, buffer = '', outputBytes = 0, fetches = 0;
			const finish = (result: CodeRunResult) => {
				if (settled) return; settled = true; clearTimeout(timer); controller.abort();
				child.kill('SIGKILL'); resolve(result);
			};
			const timer = setTimeout(() => finish({ ok: false, error: 'Zeitüberschreitung' }), Math.max(100, Math.min(30000, timeoutMs)));
			child.on('error', () => finish({ ok: false, error: 'Add-on-Prozess konnte nicht gestartet werden.' }));
			child.on('exit', () => finish({ ok: false, error: 'Add-on-Prozess beendet (z. B. Speicherlimit).' }));
			child.stdin.on('error', () => {});
			// Do not expose process diagnostics or inherit its environment in the addon result.
			child.stderr.resume();
			child.stdout.setEncoding('utf8');
			child.stdout.on('data', (chunk: string) => {
				outputBytes += Buffer.byteLength(chunk);
				if (outputBytes > 2_000_000) { finish({ ok: false, error: 'Add-on-Ausgabe zu groß.' }); return; }
				buffer += chunk;
				let end: number;
				while ((end = buffer.indexOf('\n')) !== -1) {
					const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
					let message: any;
					try { message = JSON.parse(line); } catch { finish({ ok: false, error: 'Ungültige Add-on-Ausgabe.' }); return; }
					if (message.type === 'result') { finish({ ok: Boolean(message.ok), output: message.output, error: message.error }); return; }
					if (message.type === 'fetch') {
						if (++fetches > 10) { finish({ ok: false, error: 'Zu viele Netzwerk-Anfragen.' }); return; }
						void (async () => {
							try {
								const response = await guardedFetch(String(message.url), { method: String(message.method), headers: message.headers,
									body: message.body ? Buffer.from(message.body, 'base64') : undefined, signal: controller.signal });
								const reader = response.body?.getReader(); const chunks: Uint8Array[] = []; let size = 0;
								if (reader) for (;;) {
									const { done, value } = await reader.read(); if (done) break;
									size += value.byteLength;
									if (size > 1_000_000) { await reader.cancel(); throw new Error('Netzwerk-Antwort zu groß.'); }
									chunks.push(value);
								}
								if (!settled) child.stdin.write(JSON.stringify({ type: 'response', id: message.id, status: response.status,
									headers: Object.fromEntries(response.headers), body: Buffer.concat(chunks).toString('base64') }) + '\n');
							} catch {
								if (!settled) child.stdin.write(JSON.stringify({ type: 'response', id: message.id, error: 'Netzwerk-Anfrage fehlgeschlagen oder blockiert.' }) + '\n');
							}
						})();
					}
				}
			});
			child.stdin.write(payload + '\n');
		});
	} finally { activeChildren--; }
}
