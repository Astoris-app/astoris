import { json, error } from '@sveltejs/kit';
import { listPersonas, createPersona, updatePersona, deletePersona } from '$lib/server/personas';

export async function GET() {
	return json({ personas: listPersonas() });
}
export async function POST({ request }) {
	const b = await request.json().catch(() => ({}));
	const name = (b?.name ?? '').toString().trim();
	const systemPrompt = (b?.systemPrompt ?? '').toString().trim();
	if (!name || !systemPrompt) throw error(400, 'Name und System-Prompt nötig.');
	return json({ persona: createPersona({ name, tagline: (b?.tagline ?? '').toString(), systemPrompt, emoji: (b?.emoji ?? '✨').toString() }) });
}
export async function PUT({ request, url }) {
	const id = url.searchParams.get('id');
	if (!id) throw error(400, 'id fehlt.');
	const b = await request.json().catch(() => ({}));
	const updated = updatePersona(id, b);
	if (!updated) throw error(404, 'Nicht gefunden.');
	return json({ persona: updated });
}
export async function DELETE({ url }) {
	const id = url.searchParams.get('id');
	if (!id) throw error(400, 'id fehlt.');
	return json({ ok: deletePersona(id) });
}
