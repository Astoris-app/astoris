// Eingeschränkter Ausführungs-Kontext für Code-Add-ons (node:vm).
// Verfügbar: gehärtetes fetch (SSRF-Schutz) + sichere Utility-Web-APIs (btoa/atob/crypto/TextEncoder/URL).
// Kein require/process/fs — kein Datei-/Prozess-/Modulzugriff.
// Kein vollständiger Sicherheits-Sandbox; nur für Self-Host-Code des Betreibers gedacht.

import vm from 'node:vm';
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
async function guardedFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
	let url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url;
	for (let hop = 0; hop < 5; hop++) {
		await assertPublic(url);
		const res = await fetch(url, { ...init, redirect: 'manual' });
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

export async function runCodeAddon(code: string, input: unknown, timeoutMs = 5000): Promise<CodeRunResult> {
	const logs: string[] = [];
	const sandbox = {
		fetch: guardedFetch,
		JSON,
		Math,
		Date,
		console: { log: (...a: unknown[]) => logs.push(a.map(String).join(' ')) },
		// Sichere Utility-APIs für Encoding/Hashing/URLs (keine I/O-Eskalation).
		btoa,
		atob,
		TextEncoder,
		TextDecoder,
		URL,
		URLSearchParams,
		crypto,
		input
	};
	const context = vm.createContext(sandbox, { name: 'astoris-addon' });
	const wrapped = `(async () => {\n${code}\nif (typeof run !== 'function') throw new Error('Code muss eine Funktion run(input) definieren.');\nreturn await run(input);\n})()`;
	try {
		const script = new vm.Script(wrapped, { filename: 'addon.js' });
		const promise = script.runInContext(context, { timeout: timeoutMs }) as Promise<unknown>;
		const output = await Promise.race([
			promise,
			new Promise((_, rej) => setTimeout(() => rej(new Error('Zeitüberschreitung')), timeoutMs))
		]);
		return { ok: true, output };
	} catch (e) {
		return { ok: false, error: e instanceof Error ? e.message : 'Ausführungsfehler' };
	}
}
