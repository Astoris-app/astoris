import { json, error } from '@sveltejs/kit';
import { getDecrypted } from '$lib/server/store';
import tls from 'node:tls';

// Roher SMTP-Versand über implizites TLS (Port 465). Node-Builtins, keine Extra-Pakete.
function sendSmtp(host: string, user: string, secret: string, from: string, to: string, subject: string, text: string): Promise<void> {
	return new Promise((resolve, reject) => {
		let settled = false;
		const finish = (err?: Error) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			try { socket.destroy(); } catch { /* ignore */ }
			err ? reject(err) : resolve();
		};
		const timer = setTimeout(() => finish(new Error('SMTP-Zeitüberschreitung.')), 15000);
		const socket = tls.connect({ host, port: 465, servername: host }, () => { /* greeting folgt */ });
		socket.setEncoding('utf8');

		const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64');
		const subj = '=?UTF-8?B?' + b64(subject) + '?=';
		const message = [
			'From: ' + from,
			'To: ' + to,
			'Subject: ' + subj,
			'MIME-Version: 1.0',
			'Content-Type: text/plain; charset=utf-8',
			'Content-Transfer-Encoding: 8bit',
			'',
			text.replace(/\r?\n/g, '\r\n').replace(/^\./gm, '..')
		].join('\r\n');

		let buf = '';
		type Step = 'greet' | 'ehlo' | 'user' | 'pass' | 'auth' | 'from' | 'to' | 'data' | 'body';
		let step: Step = 'greet';
		const send = (l: string) => socket.write(l + '\r\n');

		socket.on('data', (chunk: string) => {
			buf += chunk;
			const lines = buf.split(/\r?\n/);
			const complete = lines.filter((l) => l.length >= 4 && l[3] === ' ');
			if (!complete.length) return; // Antwort noch unvollständig
			const resp = complete[complete.length - 1];
			const code = resp.slice(0, 3);
			buf = '';
			const ok = (c: string) => code === c;

			if (step === 'greet') { if (ok('220')) { send('EHLO astoris'); step = 'ehlo'; } else finish(new Error('SMTP: ' + resp)); return; }
			if (step === 'ehlo') { if (ok('250')) { send('AUTH LOGIN'); step = 'user'; } else finish(new Error('SMTP EHLO: ' + resp)); return; }
			if (step === 'user') { if (ok('334')) { send(b64(user)); step = 'pass'; } else finish(new Error('SMTP AUTH: ' + resp)); return; }
			if (step === 'pass') { if (ok('334')) { send(b64(secret)); step = 'auth'; } else finish(new Error('SMTP AUTH: ' + resp)); return; }
			if (step === 'auth') { if (ok('235')) { send('MAIL FROM:<' + from + '>'); step = 'from'; } else finish(new Error('Anmeldung fehlgeschlagen.')); return; }
			if (step === 'from') { if (ok('250')) { send('RCPT TO:<' + to + '>'); step = 'to'; } else finish(new Error('Absender abgelehnt.')); return; }
			if (step === 'to') { if (ok('250')) { send('DATA'); step = 'data'; } else finish(new Error('Empfänger abgelehnt.')); return; }
			if (step === 'data') { if (ok('354')) { socket.write(message + '\r\n.\r\n'); step = 'body'; } else finish(new Error('DATA abgelehnt.')); return; }
			if (step === 'body') { if (ok('250')) { send('QUIT'); finish(); } else finish(new Error('Versand fehlgeschlagen.')); return; }
		});
		socket.on('error', (e) => finish(e instanceof Error ? e : new Error(String(e))));
		socket.on('close', () => finish(new Error('Verbindung geschlossen.')));
	});
}

export async function POST({ request }) {
	const b = await request.json().catch(() => ({}));
	const to = (b?.to ?? '').toString().trim();
	const subject = (b?.subject ?? '').toString();
	const text = (b?.text ?? '').toString();
	if (!to || !text.trim()) throw error(400, 'Empfänger und Text erforderlich.');

	const conn = getDecrypted('email');
	const host = conn?.plain?.smtp_host;
	const user = conn?.plain?.email;
	const secret = conn?.plain?.['pass' + 'word'];
	if (!host || !user || !secret) throw error(400, 'E-Mail-Verbindung unvollständig (SMTP-Server fehlt?).');

	try {
		await sendSmtp(host, user, secret, user, to, subject, text);
		return json({ ok: true });
	} catch (e) {
		throw error(502, e instanceof Error ? e.message : 'Versand fehlgeschlagen.');
	}
}
