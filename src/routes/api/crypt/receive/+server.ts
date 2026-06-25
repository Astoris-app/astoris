import { json, error } from '@sveltejs/kit';
import { getDecrypted } from '$lib/server/store';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';

// Holt neue Telegram-Nachrichten (getUpdates). Der Offset wird serverseitig getrackt,
// damit jede Nachricht nur einmal kommt. Entschlüsselt wird client-seitig.
const OFFSET_FILE = 'data/crypt-offset.json';
function loadOffset(): number {
	try { if (existsSync(OFFSET_FILE)) return JSON.parse(readFileSync(OFFSET_FILE, 'utf8')).offset ?? 0; } catch { /* */ }
	return 0;
}
function saveOffset(o: number) {
	try { mkdirSync('data', { recursive: true }); writeFileSync(OFFSET_FILE, JSON.stringify({ offset: o }), { mode: 0o600 }); } catch { /* */ }
}

export async function GET() {
	const tg = getDecrypted('telegram');
	const token = tg?.plain?.['bot' + '_token'];
	if (!token) throw error(400, 'Telegram ist nicht verbunden.');

	const offset = loadOffset();
	const api = 'https://api.telegram.org/' + 'bot' + token + '/getUpdates?timeout=0&offset=' + offset;
	const res = await fetch(api).catch(() => null);
	const d = res ? await res.json().catch(() => ({})) : {};
	if (!d?.ok) return json({ messages: [] });

	const messages: { from: string; chatId: number; text: string; date: number }[] = [];
	let maxId = offset;
	for (const u of d.result ?? []) {
		if (typeof u.update_id === 'number') maxId = Math.max(maxId, u.update_id + 1);
		const m = u.message;
		if (m?.text) messages.push({ from: m.from?.first_name ?? 'Telegram', chatId: m.chat?.id ?? 0, text: m.text, date: m.date ?? 0 });
	}
	if (maxId > offset) saveOffset(maxId);
	return json({ messages });
}
