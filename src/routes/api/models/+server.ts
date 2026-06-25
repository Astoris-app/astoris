import { json, error } from '@sveltejs/kit';
import { availableModels, getSelectedModel, setSelectedModel } from '$lib/server/models';

export async function GET() {
	return json({ models: availableModels(), selected: getSelectedModel() });
}
export async function POST({ request }) {
	const b = await request.json().catch(() => ({}));
	if (b?.clear) { setSelectedModel(null); return json({ ok: true, selected: null }); }
	const src = b?.source, model = (b?.model ?? '').toString();
	if (src === 'local' || src === 'cloud') { setSelectedModel({ source: src, model }); return json({ ok: true, selected: { source: src, model } }); }
	throw error(400, 'Ungültige Modell-Wahl.');
}
