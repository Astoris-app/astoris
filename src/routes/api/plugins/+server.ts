import { json, error } from '@sveltejs/kit';
import { listPlugins, setPluginEnabled } from '$lib/server/plugins';

export async function GET() {
	return json({ plugins: listPlugins() });
}

export async function POST({ request }) {
	const b = await request.json().catch(() => ({}));
	if (b?.action === 'toggle') {
		const ok = setPluginEnabled((b.id ?? '').toString(), Boolean(b.enabled));
		if (!ok) throw error(400, 'Add-on nicht gefunden oder Premium-Lizenz fehlt.');
		return json({ ok: true });
	}
	throw error(400, 'Unbekannte Aktion.');
}
