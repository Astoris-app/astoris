import { json, error } from '@sveltejs/kit';
import { getSendMode, setSendMode } from '$lib/server/sendMode';
export async function GET() { return json({ mode: getSendMode() }); }
export async function POST({ request }) {
	const b = await request.json().catch(() => ({}));
	const m = (b?.mode ?? '').toString();
	if (m === 'confirm' || m === 'direct') { setSendMode(m); return json({ ok: true, mode: m }); }
	throw error(400, 'Ungültiger Modus.');
}
