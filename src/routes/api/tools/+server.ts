import { json } from '@sveltejs/kit';
import { buildBuiltinTools, buildAddonTools } from '$lib/server/tools';

// Listet die der KI verfügbaren Werkzeuge (für Agent-Werkzeug-Auswahl).
export async function GET() {
	const mk = (t: { function: { name: string; description?: string } }) => ({
		name: t.function.name,
		label: (t.function.description || t.function.name).split('.')[0].slice(0, 50)
	});
	const builtin = buildBuiltinTools().map(mk);
	const addons = buildAddonTools().tools.map(mk);
	return json({ builtin, addons });
}
