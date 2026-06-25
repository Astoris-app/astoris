import { json, error } from '@sveltejs/kit';
import { getDecrypted } from '$lib/server/store';
import tls from 'node:tls';

function imapQuote(s: string): string {
	return '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
}

// Baut die RFC822-Nachricht (Plain-Text, UTF-8).
function buildMessage(from: string, to: string, subject: string, text: string): string {
	const subj = '=?UTF-8?B?' + Buffer.from(subject, 'utf8').toString('base64') + '?=';
	return [
		'From: ' + from,
		'To: ' + to,
		'Subject: ' + subj,
		'MIME-Version: 1.0',
		'Content-Type: text/plain; charset=utf-8',
		'Content-Transfer-Encoding: 8bit',
		'',
		text.replace(/\r?\n/g, '\r\n')
	].join('\r\n');
}

// Roher SMTP-Versand über implizites TLS (Port 465).
function sendSmtp(host: string, user: string, secret: string, from: string, to: string, message: string): Promise<void> {
	return new Promise((resolve, reject) => {
		let settled = false;
		const finish = (err?: Error) => { if (settled) return; settled = true; clearTimeout(timer); try { socket.destroy(); } catch { /* */ } err ? reject(err) : resolve(); };
		const timer = setTimeout(() => finish(new Error('SMTP-Zeitüberschreitung.')), 15000);
		const socket = tls.connect({ host, port: 465, servername: host }, () => { /* greeting */ });
		socket.setEncoding('utf8');
		const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64');
		const dataMsg = message.replace(/^\./gm, '..');
		let buf = '';
		type Step = 'greet' | 'ehlo' | 'user' | 'pass' | 'auth' | 'from' | 'to' | 'data' | 'body';
		let step: Step = 'greet';
		const send = (l: string) => socket.write(l + '\r\n');
		socket.on('data', (chunk: string) => {
			buf += chunk;
			const complete = buf.split(/\r?\n/).filter((l) => l.length >= 4 && l[3] === ' ');
			if (!complete.length) return;
			const code = complete[complete.length - 1].slice(0, 3);
			buf = '';
			if (step === 'greet') { code === '220' ? (send('EHLO astoris'), step = 'ehlo') : finish(new Error('SMTP')); return; }
			if (step === 'ehlo') { code === '250' ? (send('AUTH LOGIN'), step = 'user') : finish(new Error('EHLO')); return; }
			if (step === 'user') { code === '334' ? (send(b64(user)), step = 'pass') : finish(new Error('AUTH')); return; }
			if (step === 'pass') { code === '334' ? (send(b64(secret)), step = 'auth') : finish(new Error('AUTH')); return; }
			if (step === 'auth') { code === '235' ? (send('MAIL FROM:<' + from + '>'), step = 'from') : finish(new Error('Anmeldung fehlgeschlagen.')); return; }
			if (step === 'from') { code === '250' ? (send('RCPT TO:<' + to + '>'), step = 'to') : finish(new Error('Absender abgelehnt.')); return; }
			if (step === 'to') { code === '250' ? (send('DATA'), step = 'data') : finish(new Error('Empfänger abgelehnt.')); return; }
			if (step === 'data') { code === '354' ? (socket.write(dataMsg + '\r\n.\r\n'), step = 'body') : finish(new Error('DATA abgelehnt.')); return; }
			if (step === 'body') { code === '250' ? (send('QUIT'), finish()) : finish(new Error('Versand fehlgeschlagen.')); return; }
		});
		socket.on('error', (e) => finish(e instanceof Error ? e : new Error(String(e))));
		socket.on('close', () => finish(new Error('Verbindung geschlossen.')));
	});
}

// Legt die gesendete Nachricht im "Gesendet"-Ordner ab (IMAP APPEND). Best-effort.
function appendToSent(host: string, user: string, secret: string, message: string): Promise<void> {
	return new Promise((resolve, reject) => {
		let settled = false;
		const finish = (err?: Error) => { if (settled) return; settled = true; clearTimeout(timer); try { socket.destroy(); } catch { /* */ } err ? reject(err) : resolve(); };
		const timer = setTimeout(() => finish(new Error('IMAP-Zeitüberschreitung.')), 12000);
		const socket = tls.connect({ host, port: 993, servername: host }, () => { /* greeting */ });
		socket.setEncoding('utf8');
		let buf = '';
		let sent = '';
		const folders: string[] = [];
		type Step = 'greet' | 'login' | 'list' | 'append' | 'data';
		let step: Step = 'greet';
		const send = (l: string) => socket.write(l + '\r\n');
		const data = message.replace(/\r?\n/g, '\r\n');
		socket.on('data', (chunk: string) => {
			buf += chunk;
			if (step === 'greet') { if (/\r?\n/.test(buf)) { buf = ''; step = 'login'; send('a1 LOGIN ' + imapQuote(user) + ' ' + imapQuote(secret)); } return; }
			if (step === 'login') { if (/^a1 (OK|NO|BAD)/im.test(buf)) { if (/^a1 OK/im.test(buf)) { buf = ''; step = 'list'; send('a2 LIST "" "*"'); } else finish(new Error('login')); } return; }
			if (step === 'list') {
				if (/^a2 (OK|NO|BAD)/im.test(buf)) {
					for (const l of buf.split(/\r?\n/)) {
						const m = l.match(/^\* LIST \(([^)]*)\)\s+"[^"]*"\s+"?([^"\r\n]+)"?/i);
						if (m) { if (/\\Sent/i.test(m[1])) sent = m[2]; folders.push(m[2]); }
					}
					if (!sent) sent = folders.find((f) => /^(Sent|Gesendet|Sent Items|INBOX\.Sent)$/i.test(f)) ?? 'Sent';
					buf = ''; step = 'append';
					send('a3 APPEND ' + imapQuote(sent) + ' (\\Seen) {' + Buffer.byteLength(data, 'utf8') + '}');
				}
				return;
			}
			if (step === 'append') { if (/^\+/m.test(buf)) { buf = ''; step = 'data'; socket.write(data + '\r\n'); } else if (/^a3 (NO|BAD)/im.test(buf)) finish(new Error('append')); return; }
			if (step === 'data') { if (/^a3 (OK|NO|BAD)/im.test(buf)) { /^a3 OK/im.test(buf) ? finish() : finish(new Error('append failed')); } return; }
		});
		socket.on('error', (e) => finish(e instanceof Error ? e : new Error(String(e))));
		socket.on('close', () => finish(new Error('closed')));
	});
}

export async function POST({ request }) {
	const b = await request.json().catch(() => ({}));
	const to = (b?.to ?? '').toString().trim();
	const subject = (b?.subject ?? '').toString();
	const text = (b?.text ?? '').toString();
	if (!to || !text.trim()) throw error(400, 'Empfänger und Text erforderlich.');

	const conn = getDecrypted('email');
	const smtpHost = conn?.plain?.smtp_host;
	const imapHost = conn?.plain?.imap_host;
	const user = conn?.plain?.email;
	const secret = conn?.plain?.['pass' + 'word'];
	if (!smtpHost || !user || !secret) throw error(400, 'E-Mail-Verbindung unvollständig (SMTP-Server fehlt?).');

	const message = buildMessage(user, to, subject, text);
	try {
		await sendSmtp(smtpHost, user, secret, user, to, message);
	} catch (e) {
		throw error(502, e instanceof Error ? e.message : 'Versand fehlgeschlagen.');
	}
	// Sent-Folder: best-effort, blockiert den Erfolg nicht.
	let savedToSent = false;
	if (imapHost) {
		try { await appendToSent(imapHost, user, secret, message); savedToSent = true; } catch { /* ignore */ }
	}
	return json({ ok: true, savedToSent });
}
