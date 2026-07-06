// Eingeschränkter Ausführungs-Kontext für Code-Add-ons (node:vm).
// Verfügbar: gehärtetes fetch (SSRF-Schutz) + sichere Utility-Web-APIs (btoa/atob/crypto/TextEncoder/URL).
// Kein require/process/fs — kein Datei-/Prozess-/Modulzugriff.
// Kein vollständiger Sicherheits-Sandbox; nur für Self-Host-Code des Betreibers gedacht.

import vm from 'node:vm';
import dns from 'node:dns/promises';
import { lookup as dnsLookup } from 'node:dns';
import net from 'node:net';
import { Agent, fetch as undiciFetch } from 'undici';

export type CodeRunResult = { ok: boolean; output?: unknown; error?: string };

// SSRF-Schutz: private/Loopback/Link-Local-Adressen sperren (inkl. Cloud-Metadata 169.254.x).
function isPrivateIp(ip: string): boolean {
	if (net.isIPv4(ip)) {
		if (/^127\./.test(ip) || /^10\./.test(ip) || /^192\.168\./.test(ip) || /^169\.254\./.test(ip) || /^0\./.test(ip)) return true;
		if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return true;
		// CGNAT-Bereich 100.64.0.0/10 (u. a. von VPN-Overlays genutzt) — kann interne Dienste erreichbar machen, daher sperren.
		if (/^100\.(6[4-9]|[7-9]\d|1[0-1]\d|12[0-7])\./.test(ip)) return true;
		// Multicast/reserviert/Broadcast (224.0.0.0 – 255.255.255.255).
		if (/^(22[4-9]|23\d|24\d|25[0-5])\./.test(ip)) return true;
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

// Lookup-Hook für undici: prüft die TATSÄCHLICH zu verbindende IP zum Connect-Zeitpunkt.
// Schließt DNS-Rebinding/TOCTOU — assertPublic (Vorab-Check) kann durch einen zweiten,
// abweichenden DNS-Lookip beim Connect umgangen werden; dieser Hook prüft genau die Connect-IP.
function guardedLookup(
	hostname: string,
	options: Parameters<typeof dnsLookup>[1],
	cb: (err: NodeJS.ErrnoException | null, address: unknown, family?: number) => void
): void {
	const opts = (typeof options === 'object' && options ? options : {}) as { all?: boolean; family?: number };
	dnsLookup(hostname, { ...opts, all: true }, (err, addresses) => {
		if (err) return cb(err, '', 0);
		const list = addresses as { address: string; family: number }[];
		for (const a of list) {
			if (isPrivateIp(a.address)) return cb(new Error('Zugriff auf interne Adressen blockiert'), '', 0);
		}
		if (opts.all) return cb(null, list);
		cb(null, list[0].address, list[0].family);
	});
}

// Dispatcher mit gehärtetem Lookup — für alle safeFetch-Verbindungen (Add-ons + Deep Research).
const safeAgent = new Agent({ connect: { lookup: guardedLookup as never } });

// Gehärtetes fetch: prüft jede Ziel-URL (auch jede Weiterleitung) gegen private Netze (SSRF-Schutz).
// Zwei Schichten: assertPublic (schnelles Vorab-Ablehnen) + guardedLookup (TOCTOU-sichere Connect-IP).
// Von Code-Add-ons (Sandbox) UND der Deep-Research-Pipeline (Quellen-Fetch) genutzt — ein gehärteter Pfad.
export async function safeFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
	let url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url;
	for (let hop = 0; hop < 5; hop++) {
		await assertPublic(url);
		// undici-eigenes fetch (nicht Node-global) — nur so ist der Agent-Dispatcher versionskompatibel.
		const res = await undiciFetch(url, { ...init, redirect: 'manual', dispatcher: safeAgent } as Parameters<typeof undiciFetch>[1]);
		if (res.status >= 300 && res.status < 400) {
			const loc = res.headers.get('location');
			if (loc) {
				url = new URL(loc, url).href;
				continue;
			}
		}
		return res as unknown as Response;
	}
	throw new Error('Zu viele Weiterleitungen');
}

export async function runCodeAddon(code: string, input: unknown, timeoutMs = 5000): Promise<CodeRunResult> {
	const logs: string[] = [];
	const sandbox = {
		fetch: safeFetch,
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
		// Für Multipart-Uploads (z. B. Bild an Erkennungs-API ohne öffentliche URL).
		FormData,
		Blob,
		Uint8Array,
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
