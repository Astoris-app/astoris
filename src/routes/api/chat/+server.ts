import { json, error } from '@sveltejs/kit';
import { engineChat, type ChatMsg } from '$lib/server/engine';

export async function POST({ request }) {
	const body = await request.json().catch(() => null);
	let messages: ChatMsg[] = Array.isArray(body?.messages) ? body.messages : [];
	if (!messages.length && body?.message) messages = [{ role: 'user', content: String(body.message) }];
	messages = messages
		.filter((m) => m && typeof m.content === 'string' && m.content.trim())
		.slice(-20); // Kontext begrenzen
	if (!messages.length) throw error(400, 'message fehlt');
	const result = await engineChat(messages);
	return json(result);
}
