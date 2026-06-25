// Local calendar event persistence in data/calendar.json.
// Events are plain JSON; no encryption needed (no credentials).
import { json, error } from '@sveltejs/kit';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const FILE = 'data/calendar.json';

export type CalendarEvent = {
	id: string;
	title: string;
	date: string; // YYYY-MM-DD
	time?: string; // HH:MM
	notes?: string;
};

function load(): CalendarEvent[] {
	if (!existsSync(FILE)) return [];
	try {
		const parsed = JSON.parse(readFileSync(FILE, 'utf8'));
		return Array.isArray(parsed) ? (parsed as CalendarEvent[]) : [];
	} catch {
		// Missing or corrupt file → start fresh.
		return [];
	}
}

function persist(list: CalendarEvent[]) {
	mkdirSync('data', { recursive: true });
	writeFileSync(FILE, JSON.stringify(list, null, 2));
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

export function GET() {
	return json({ events: load() });
}

export async function POST({ request }) {
	const body = await request.json().catch(() => null);
	const title = (body?.title ?? '').toString().trim();
	const date = (body?.date ?? '').toString().trim();
	const time = (body?.time ?? '').toString().trim();
	const notes = (body?.notes ?? '').toString().trim();

	if (!title) throw error(400, 'Titel ist erforderlich.');
	if (!DATE_RE.test(date)) throw error(400, 'Gültiges Datum (YYYY-MM-DD) ist erforderlich.');
	if (time && !TIME_RE.test(time)) throw error(400, 'Uhrzeit muss im Format HH:MM sein.');

	const event: CalendarEvent = { id: randomUUID(), title, date };
	if (time) event.time = time;
	if (notes) event.notes = notes;

	const list = load();
	list.push(event);
	persist(list);
	return json({ event });
}

export function DELETE({ url }) {
	const id = url.searchParams.get('id');
	if (!id) throw error(400, 'id fehlt.');
	const list = load();
	const next = list.filter((e) => e.id !== id);
	persist(next);
	return json({ ok: true });
}
