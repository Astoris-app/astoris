import { json, error } from '@sveltejs/kit';
import { runtimeStore } from '$lib/server/runtime';
import { getActiveId } from '$lib/server/companies';
import { engineChat, type ChatMsg } from '$lib/server/engine';

export function GET({ locals }) {
	if (!locals.user) throw error(401, 'Nicht angemeldet.');
	return json({ runs: runtimeStore().list(getActiveId(), locals.user.name) });
}

/** Versioned by contract in docs/RUNTIME.md; the same execution path as the UI. */
export async function POST({ request, locals }) {
	if (!locals.user) throw error(401, 'Nicht angemeldet.');
	const body = await request.json().catch(() => null);
	if (!body || typeof body.message !== 'string' || !body.message.trim() || body.message.length > 32000) throw error(400, 'Nachricht erforderlich (maximal 32000 Zeichen).');
	const messages: ChatMsg[] = [{ role: 'user', content: body.message.trim() }];
	return json(await engineChat(messages));
}
