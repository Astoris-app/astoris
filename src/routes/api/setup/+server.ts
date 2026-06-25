import { json } from '@sveltejs/kit';
import { isSetupDone, markSetupDone } from '$lib/server/setup';

export async function GET() {
	return json({ done: isSetupDone() });
}

export async function POST({ request }) {
	const body = await request.json().catch(() => ({}));
	markSetupDone(body?.profile?.toString() || 'personal');
	return json({ ok: true });
}
