import { json, error } from '@sveltejs/kit';
import { engineChat } from '$lib/server/engine';
import { guardExternal } from '$lib/server/promptGuard';

// KI-Aktionen für eine E-Mail. Der Mail-Inhalt ist EXTERNE Quelle → durch promptGuard
// als Daten gewrappt, damit darin enthaltene Anweisungen nicht befolgt werden.
export async function POST({ request }) {
	const b = await request.json().catch(() => ({}));
	const action = (b?.action ?? '').toString();
	const body = (b?.body ?? '').toString();
	const subject = (b?.subject ?? '').toString();
	const from = (b?.from ?? '').toString();
	if (!body.trim()) throw error(400, 'Mail-Text fehlt.');

	const { safe } = guardExternal(body, 'E-MAIL-INHALT');

	let sys = '';
	let task = '';
	if (action === 'summarize') {
		sys = 'Du fasst E-Mails knapp und sachlich auf Deutsch zusammen: 3–4 Stichpunkte, Kernaussage zuerst, dann ggf. die geforderte Aktion. Keine Einleitung.';
		task = 'Fasse diese E-Mail zusammen.';
	} else if (action === 'reply-draft') {
		sys = 'Du entwirfst höfliche, knappe Antwort-E-Mails auf Deutsch (Sie-Form, max. 120 Wörter). Gib NUR den Antworttext aus, ohne Betreff und ohne Signatur.';
		task = 'Entwirf eine passende, freundliche Antwort auf diese E-Mail.';
	} else {
		throw error(400, 'Unbekannte Aktion.');
	}

	const user = `Betreff: ${subject}\nVon: ${from}\n\n${safe}\n\n${task}`;
	const result = await engineChat([
		{ role: 'system', content: sys },
		{ role: 'user', content: user }
	]);
	return json({ result: result.reply, source: result.source });
}
