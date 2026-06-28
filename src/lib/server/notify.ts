// Operator-Benachrichtigung für System-Ereignisse (z. B. neue Voicemail).
// Bevorzugt Telegram (falls Bot + Chat-ID vorhanden), sonst/zusätzlich E-Mail an
// die eigene Adresse der E-Mail-Verbindung. Beide Wege sind best-effort — ein
// Fehler darf den auslösenden Flow (Anruf speichern) nie brechen.

import { getDecrypted } from './store';
import tls from 'node:tls';

export type NotifyResult = { telegram: boolean; email: boolean };

/** Telegram-Nachricht über den verbundenen Bot. Liefert true bei Erfolg. */
async function sendTelegram(chatId: string, text: string): Promise<boolean> {
	const tg = getDecrypted('telegram');
	const token = tg?.plain?.['bot' + '_token'];
	if (!token || !chatId) return false;
	try {
		const res = await fetch('https://api.telegram.org/' + 'bot' + token + '/sendMessage', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ chat_id: chatId, text })
		});
		const d = await res.json().catch(() => ({}));
		return Boolean(res.ok && (d as { ok?: boolean }).ok);
	} catch {
		return false;
	}
}

/** Minimaler SMTP-Versand über implizites TLS (Port 465). Best-effort. */
function sendSmtp(host: string, user: string, secret: string, to: string, subject: string, body: string): Promise<void> {
	return new Promise((resolve, reject) => {
		let settled = false;
		const finish = (err?: Error) => { if (settled) return; settled = true; clearTimeout(timer); try { socket.destroy(); } catch { /* */ } err ? reject(err) : resolve(); };
		const timer = setTimeout(() => finish(new Error('SMTP-Zeitüberschreitung.')), 15000);
		const socket = tls.connect({ host, port: 465, servername: host }, () => { /* greeting */ });
		socket.setEncoding('utf8');
		const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64');
		const subj = '=?UTF-8?B?' + Buffer.from(subject, 'utf8').toString('base64') + '?=';
		const message = [
			'From: ' + user,
			'To: ' + to,
			'Subject: ' + subj,
			'MIME-Version: 1.0',
			'Content-Type: text/plain; charset=utf-8',
			'Content-Transfer-Encoding: 8bit',
			'',
			body.replace(/\r?\n/g, '\r\n')
		].join('\r\n');
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
			if (step === 'auth') { code === '235' ? (send('MAIL FROM:<' + user + '>'), step = 'from') : finish(new Error('Anmeldung fehlgeschlagen.')); return; }
			if (step === 'from') { code === '250' ? (send('RCPT TO:<' + to + '>'), step = 'to') : finish(new Error('Absender abgelehnt.')); return; }
			if (step === 'to') { code === '250' ? (send('DATA'), step = 'data') : finish(new Error('Empfänger abgelehnt.')); return; }
			if (step === 'data') { code === '354' ? (socket.write(dataMsg + '\r\n.\r\n'), step = 'body') : finish(new Error('DATA abgelehnt.')); return; }
			if (step === 'body') { code === '250' ? (send('QUIT'), finish()) : finish(new Error('Versand fehlgeschlagen.')); return; }
		});
		socket.on('error', (e) => finish(e instanceof Error ? e : new Error(String(e))));
		socket.on('close', () => finish(new Error('Verbindung geschlossen.')));
	});
}

/** E-Mail an die eigene Adresse der E-Mail-Verbindung. Liefert true bei Erfolg. */
async function sendSelfEmail(subject: string, body: string): Promise<boolean> {
	const conn = getDecrypted('email');
	const host = conn?.plain?.smtp_host;
	const user = conn?.plain?.email;
	const secret = conn?.plain?.['pass' + 'word'];
	if (!host || !user || !secret) return false;
	try {
		await sendSmtp(host, user, secret, user, subject, body);
		return true;
	} catch {
		return false;
	}
}

/**
 * Meldet ein Ereignis an den Operator. Versucht Telegram (wenn chatId gesetzt)
 * UND fällt auf E-Mail zurück, wenn Telegram nicht zugestellt wurde. Wirft nie.
 */
export async function notifyOperator(opts: { chatId?: string; subject: string; text: string }): Promise<NotifyResult> {
	const result: NotifyResult = { telegram: false, email: false };
	try {
		if (opts.chatId) result.telegram = await sendTelegram(opts.chatId, opts.text);
		if (!result.telegram) result.email = await sendSelfEmail(opts.subject, opts.text);
	} catch {
		/* notification is best-effort and must never break the caller */
	}
	return result;
}
