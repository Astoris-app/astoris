import { json, error } from '@sveltejs/kit';
import { listEvents, createEvent, updateEvent, deleteEvent } from '$lib/server/calendar';

export function GET() {
	return json({ events: listEvents() });
}

export async function POST({ request }) {
	const b = await request.json().catch(() => ({}));
	try {
		return json({ event: createEvent((b?.title ?? '').toString(), (b?.date ?? '').toString(), (b?.time ?? '').toString(), (b?.notes ?? '').toString()) });
	} catch (e) {
		throw error(400, e instanceof Error ? e.message : 'Ungültiger Termin.');
	}
}

export async function PUT({ request }) {
	const b = await request.json().catch(() => ({}));
	const id = (b?.id ?? '').toString();
	if (!id) throw error(400, 'id fehlt.');
	let ev;
	try {
		ev = updateEvent(id, b);
	} catch (e) {
		throw error(400, e instanceof Error ? e.message : 'Ungültige Änderung.');
	}
	if (!ev) throw error(404, 'Termin nicht gefunden.');
	return json({ event: ev });
}

export function DELETE({ url }) {
	const id = url.searchParams.get('id');
	if (!id) throw error(400, 'id fehlt.');
	return json({ ok: deleteEvent(id) });
}
