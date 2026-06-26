import { json, error } from '@sveltejs/kit';
import { getDecrypted } from '$lib/server/store';

// Sendet einen bereits verschlüsselten Block über einen Social-Kanal als Transport.
// Der Server sieht nur Chiffretext (Verschlüsselung passiert client-seitig im Browser).
export async function POST({ request }) {
	const b = await request.json().catch(() => ({}));
	const channel = (b?.channel ?? '').toString();
	const to = (b?.to ?? '').toString().trim();
	const text = (b?.text ?? '').toString();
	if (!text) throw error(400, 'Nachricht fehlt.');
	if (!to) throw error(400, 'Empfänger fehlt.');

	if (channel === 'telegram') {
		const tg = getDecrypted('telegram');
		const token = tg?.plain?.['bot' + '_token'];
		if (!token) throw error(400, 'Telegram ist nicht verbunden (unter Verbindungen einrichten).');
		const api = 'https://api.telegram.org/' + 'bot' + token + '/sendMessage';
		const res = await fetch(api, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ chat_id: to, text })
		}).catch(() => null);
		const d = res ? await res.json().catch(() => ({})) : {};
		if (!res || !d.ok) throw error(502, 'Telegram: ' + (d?.description ?? 'Senden fehlgeschlagen.'));
		return json({ ok: true });
	}

	if (channel === 'slack') {
		const sl = getDecrypted('slack');
		const token = sl?.plain?.['bot' + '_token'];
		if (!token) throw error(400, 'Slack ist nicht verbunden (unter Verbindungen einrichten).');
		const res = await fetch('https://slack.com/api/chat.postMessage', {
			method: 'POST',
			headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token },
			body: JSON.stringify({ channel: to, text })
		}).catch(() => null);
		const d = res ? await res.json().catch(() => ({})) : {};
		if (!res || !d.ok) throw error(502, 'Slack: ' + (d?.error ?? 'Senden fehlgeschlagen.'));
		return json({ ok: true });
	}

	if (channel === 'discord') {
		const dc = getDecrypted('discord');
		const token = dc?.plain?.['bot' + '_token'];
		if (!token) throw error(400, 'Discord ist nicht verbunden (unter Verbindungen einrichten).');
		const res = await fetch('https://discord.com/api/v10/channels/' + encodeURIComponent(to) + '/messages', {
			method: 'POST',
			headers: { 'content-type': 'application/json', authorization: 'Bot ' + token },
			body: JSON.stringify({ content: text })
		}).catch(() => null);
		if (!res || !res.ok) {
			const d = res ? await res.json().catch(() => ({})) : {};
			throw error(502, 'Discord: ' + (d?.message ?? 'Senden fehlgeschlagen.'));
		}
		return json({ ok: true });
	}

	throw error(400, 'Kanal nicht unterstützt (Telegram/Slack/Discord verfügbar; WhatsApp/Signal/E-Mail per Teilen-Link).');
}
