import { json } from '@sveltejs/kit';
import { getLog, clearLog } from '$lib/server/syslog';

// Auth: alle /api-Routen sind in hooks.server.ts session-pflichtig (kein eigener Check nötig).

export async function GET() {
	return json({ entries: getLog() });
}

export async function POST({ request }) {
	const b = await request.json().catch(() => ({}));
	if (b?.action === 'clear') return json({ entries: clearLog() });
	return json({ entries: getLog() });
}
