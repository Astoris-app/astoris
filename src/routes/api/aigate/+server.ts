import { json, error } from '@sveltejs/kit';
import { getAigateMode, setAigateMode } from '$lib/server/aigate';

export async function GET() {
	return json({ mode: getAigateMode() });
}
export async function POST({ request }) {
	const b = await request.json().catch(() => ({}));
	const mode = (b?.mode ?? '').toString();
	if (mode === 'off' || mode === 'redact' || mode === 'block') {
		setAigateMode(mode);
		return json({ ok: true, mode });
	}
	throw error(400, 'Ungültiger Modus.');
}
