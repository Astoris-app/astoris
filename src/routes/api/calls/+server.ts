import { json } from '@sveltejs/kit';
import { getCalls, markRead, removeCall } from '$lib/server/calls';

// Diese Route erfordert eine Sitzung (geprüft in hooks.server.ts) und ist NICHT
// in der Webhook-Whitelist. Nur /api/calls/incoming und /api/calls/recording sind offen.

export async function GET() {
	return json({ calls: getCalls() });
}

export async function POST({ request }) {
	const b = await request.json().catch(() => ({}));
	const action = (b?.action ?? '').toString();
	const id = (b?.id ?? '').toString();
	if (action === 'mark-read' && id) return json({ calls: markRead(id) });
	if (action === 'delete' && id) return json({ calls: removeCall(id) });
	return json({ calls: getCalls() });
}
