// Lokaler Kalender-Speicher (data/calendar.json). Genutzt von der API und den KI-Werkzeugen.
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

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

function load(): CalendarEvent[] {
	if (!existsSync(FILE)) return [];
	try {
		const parsed = JSON.parse(readFileSync(FILE, 'utf8'));
		return Array.isArray(parsed) ? (parsed as CalendarEvent[]) : [];
	} catch {
		return [];
	}
}
function persist(list: CalendarEvent[]) {
	mkdirSync('data', { recursive: true });
	writeFileSync(FILE, JSON.stringify(list, null, 2));
}

/** Alle Termine, optional auf einen Datumsbereich (inkl.) gefiltert, nach Datum/Zeit sortiert. */
export function listEvents(from?: string, to?: string): CalendarEvent[] {
	let list = load();
	if (from && DATE_RE.test(from)) list = list.filter((e) => e.date >= from);
	if (to && DATE_RE.test(to)) list = list.filter((e) => e.date <= to);
	return list.sort((a, b) => (a.date + (a.time ?? '')).localeCompare(b.date + (b.time ?? '')));
}

export function createEvent(title: string, date: string, time?: string, notes?: string): CalendarEvent {
	if (!title.trim()) throw new Error('Titel ist erforderlich.');
	if (!DATE_RE.test(date)) throw new Error('Datum muss YYYY-MM-DD sein.');
	if (time && !TIME_RE.test(time)) throw new Error('Uhrzeit muss HH:MM sein.');
	const event: CalendarEvent = { id: randomUUID(), title: title.trim(), date };
	if (time) event.time = time;
	if (notes?.trim()) event.notes = notes.trim();
	const list = load();
	list.push(event);
	persist(list);
	return event;
}

export function updateEvent(id: string, patch: Partial<Omit<CalendarEvent, 'id'>>): CalendarEvent | null {
	const list = load();
	const ev = list.find((e) => e.id === id);
	if (!ev) return null;
	if (patch.title !== undefined && patch.title.trim()) ev.title = patch.title.trim();
	if (patch.date !== undefined) { if (!DATE_RE.test(patch.date)) throw new Error('Datum muss YYYY-MM-DD sein.'); ev.date = patch.date; }
	if (patch.time !== undefined) { if (patch.time && !TIME_RE.test(patch.time)) throw new Error('Uhrzeit muss HH:MM sein.'); ev.time = patch.time || undefined; }
	if (patch.notes !== undefined) ev.notes = patch.notes.trim() || undefined;
	persist(list);
	return ev;
}

export function deleteEvent(id: string): boolean {
	const list = load();
	const next = list.filter((e) => e.id !== id);
	if (next.length === list.length) return false;
	persist(next);
	return true;
}
