import { json, error } from '@sveltejs/kit';
import {
	listHistory,
	renameEntry,
	setFavorite,
	removeEntry,
	clearHistory
} from '$lib/server/research-history';

export async function GET() {
	return json({ history: listHistory() });
}

export async function POST({ request }) {
	const b = await request.json().catch(() => ({}));
	const action = (b?.action ?? '').toString();
	switch (action) {
		case 'rename': {
			if (!b?.id) throw error(400, 'id fehlt.');
			return json({ ok: renameEntry(b.id.toString(), (b?.title ?? '').toString()) });
		}
		case 'favorite': {
			if (!b?.id) throw error(400, 'id fehlt.');
			return json({ ok: setFavorite(b.id.toString(), Boolean(b?.favorite)) });
		}
		case 'delete': {
			if (!b?.id) throw error(400, 'id fehlt.');
			return json({ ok: removeEntry(b.id.toString()) });
		}
		case 'clear': {
			return json({ ok: clearHistory() });
		}
		default:
			throw error(400, 'Unbekannte Aktion.');
	}
}
