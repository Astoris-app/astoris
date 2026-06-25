import { json, error } from '@sveltejs/kit';
import { listChats, getChat, saveChat, renameChat, deleteChat } from '$lib/server/chats';

export async function GET({ url }) {
	const id = url.searchParams.get('id');
	if (id) {
		const chat = getChat(id);
		if (!chat) throw error(404, 'Chat nicht gefunden.');
		return json({ chat });
	}
	return json({ chats: listChats() });
}

export async function POST({ request }) {
	const b = await request.json().catch(() => ({}));
	if (!Array.isArray(b?.messages)) throw error(400, 'messages fehlt.');
	const chat = saveChat({ id: b.id, messages: b.messages, title: b.title });
	return json({ chat });
}

export async function PUT({ request, url }) {
	const id = url.searchParams.get('id');
	if (!id) throw error(400, 'id fehlt.');
	const b = await request.json().catch(() => ({}));
	const ok = renameChat(id, (b?.title ?? '').toString());
	return json({ ok });
}

export async function DELETE({ url }) {
	const id = url.searchParams.get('id');
	if (!id) throw error(400, 'id fehlt.');
	return json({ ok: deleteChat(id) });
}
