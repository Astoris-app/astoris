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

	throw error(400, 'Kanal nicht unterstützt (Telegram verfügbar; WhatsApp/Signal/E-Mail per Teilen-Link).');
}
