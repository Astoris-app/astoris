import { json, error } from '@sveltejs/kit';
import { getKiSource, setKiSource } from '$lib/server/kiSource';

export async function GET() {
	return json({ source: getKiSource() });
}
export async function POST({ request }) {
	const b = await request.json().catch(() => ({}));
	const s = (b?.source ?? '').toString();
	if (s === 'auto' || s === 'local' || s === 'cloud') {
		setKiSource(s);
		return json({ ok: true, source: s });
	}
	throw error(400, 'Ungültige KI-Quelle.');
}
