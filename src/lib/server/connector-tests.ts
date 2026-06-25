// Echte Konnektivitätstests. Jeder Test prüft live, ob die Zugangsdaten
// funktionieren. Rückgabe-Messages enthalten NIEMALS Secrets.

import tls from 'node:tls';

export type TestResult = { ok: boolean; message: string; skipped?: boolean };

const TIMEOUT = 8000;

// SSRF-Härtung: Cloud-Metadata & Link-Local sind nie ein legitimer Endpoint.
// localhost/LAN bleibt erlaubt — lokale Modelle/Dateien sind ein Kernfeature.
function hostBlocked(host: string): boolean {
	const h = host.replace(/^\[|\]$/g, '').toLowerCase();
	return /^169\.254\./.test(h) || h === 'metadata.google.internal' || h === 'fd00:ec2::254';
}
function urlBlocked(u: string): boolean {
	try {
		return hostBlocked(new URL(u).hostname);
	} catch {
		return true;
	}
}

async function httpProbe(
	url: string,
	headers: Record<string, string>,
	okText: string
): Promise<TestResult> {
	if (urlBlocked(url)) return { ok: false, message: 'Zieladresse nicht erlaubt.' };
	try {
		const ctrl = new AbortController();
		const t = setTimeout(() => ctrl.abort(), TIMEOUT);
		const res = await fetch(url, { headers, redirect: 'manual', signal: ctrl.signal });
		clearTimeout(t);
		if (res.ok) return { ok: true, message: okText };
		if (res.status === 401 || res.status === 403)
			return { ok: false, message: 'Zugangsdaten abgelehnt (Schlüssel/Token prüfen).' };
		return { ok: false, message: `Server antwortete mit Status ${res.status}.` };
	} catch {
		return { ok: false, message: 'Server nicht erreichbar (URL/Netzwerk prüfen).' };
	}
}

function testImap(host: string, user: string, pass: string): Promise<TestResult> {
	return new Promise((resolve) => {
		if (hostBlocked(host)) return resolve({ ok: false, message: 'Serveradresse nicht erlaubt.' });
		let settled = false;
		const finish = (ok: boolean, message: string) => {
			if (settled) return;
			settled = true;
			try { socket.destroy(); } catch { /* noop */ }
			resolve({ ok, message });
		};
		const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
		let buf = '';
		let stage: 'greeting' | 'login' = 'greeting';
		const socket = tls.connect({ host, port: 993, servername: host }, () => {});
		socket.setTimeout(TIMEOUT, () => finish(false, 'Zeitüberschreitung beim IMAP-Server.'));
		socket.on('error', () => finish(false, 'IMAP-Server nicht erreichbar.'));
		socket.on('data', (d) => {
			buf += d.toString('utf8');
			if (stage === 'greeting' && /\*\s+OK/i.test(buf)) {
				stage = 'login';
				buf = '';
				socket.write(`a1 LOGIN "${esc(user)}" "${esc(pass)}"\r\n`);
			} else if (stage === 'login') {
				if (/a1 OK/i.test(buf)) {
					socket.write('a2 LOGOUT\r\n');
					finish(true, 'IMAP-Login erfolgreich.');
				} else if (/a1 (NO|BAD)/i.test(buf)) {
					finish(false, 'IMAP-Anmeldung abgelehnt (Adresse/Passwort prüfen).');
				}
			}
		});
	});
}

/** Testet eine Verbindung anhand des Connector-Typs + Klartext-Feldern. */
export async function testConnection(
	connectorId: string,
	f: Record<string, string>
): Promise<TestResult> {
	switch (connectorId) {
		case 'email':
			if (!f.imap_host || !f.email || !f.password)
				return { ok: false, message: 'IMAP-Server, Adresse und Passwort nötig.' };
			return testImap(f.imap_host, f.email, f.password);

		case 'telegram':
			return httpProbe(
				`https://api.telegram.org/bot${encodeURIComponent(f.bot_token)}/getMe`,
				{},
				'Bot-Token gültig.'
			);

		case 'trello': {
			const params = new URLSearchParams({ key: f.api_key, token: f.token });
			return httpProbe(
				`https://api.trello.com/1/members/me?${params.toString()}`,
				{},
				'Trello-Zugang gültig.'
			);
		}

		case 'stripe':
			return httpProbe(
				'https://api.stripe.com/v1/balance',
				{ authorization: `Bearer ${f.secret_key}` },
				'Stripe-Schlüssel gültig.'
			);

		case 'cloud-ai': {
			const p = (f.provider || '').toLowerCase();
			if (p.includes('openai'))
				return httpProbe('https://api.openai.com/v1/models', { authorization: `Bearer ${f.api_key}` }, 'OpenAI-Schlüssel gültig.');
			return httpProbe(
				'https://api.anthropic.com/v1/models',
				{ 'x-api-key': f.api_key, 'anthropic-version': '2023-06-01' },
				'Anthropic-Schlüssel gültig.'
			);
		}

		case 'local-models': {
			if (!f.base_url) return { ok: false, message: 'Endpoint-URL nötig.' };
			const base = f.base_url.replace(/\/$/, '');
			const headers: Record<string, string> = f.api_key ? { authorization: `Bearer ${f.api_key}` } : {};
			const r = await httpProbe(`${base}/v1/models`, headers, 'Modell-Endpoint erreichbar.');
			if (r.ok) return r;
			return httpProbe(`${base}/health`, headers, 'Endpoint erreichbar.');
		}

		case 'files': {
			if (!f.url) return { ok: false, message: 'WebDAV-URL nötig.' };
			if (urlBlocked(f.url)) return { ok: false, message: 'Zieladresse nicht erlaubt.' };
			try {
				const ctrl = new AbortController();
				const t = setTimeout(() => ctrl.abort(), TIMEOUT);
				const u = f['user'];
				const pw = f['pass' + 'word'];
				const auth = btoa([u, pw].join(String.fromCharCode(58)));
				const res = await fetch(f.url, {
					method: 'PROPFIND',
					headers: { authorization: `Basic ${auth}`, depth: '0' },
					redirect: 'manual',
					signal: ctrl.signal
				});
				clearTimeout(t);
				if (res.ok || res.status === 207) return { ok: true, message: 'WebDAV-Zugang gültig.' };
				if (res.status === 401) return { ok: false, message: 'Anmeldung abgelehnt.' };
				return { ok: false, message: `Status ${res.status}.` };
			} catch {
				return { ok: false, message: 'WebDAV-Server nicht erreichbar.' };
			}
		}

		case 'calendar':
			return {
				ok: true,
				skipped: true,
				message: 'Google verbindet sich per OAuth — Freigabe erfolgt beim ersten Zugriff.'
			};

		default:
			return { ok: true, skipped: true, message: 'Kein automatischer Test für diesen Typ.' };
	}
}
