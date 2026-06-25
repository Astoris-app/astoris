// Verbindet Code-Add-ons (agent-tool) mit dem KI-Chat: aktive Add-ons werden
// der KI als aufrufbare Werkzeuge (OpenAI tool-calling) angeboten und in der
// Sandbox ausgeführt, wenn die KI sie aufruft.

import { listPlugins, getPlugin } from './plugins';
import { runCodeAddon } from './sandbox';
import type { CodeManifest } from '$lib/plugins/types';

export type AddonTool = { type: 'function'; function: { name: string; description: string; parameters: unknown } };

/** Leitet aus dem Beispiel-Input (inputHint) ein einfaches JSON-Schema ab. */
function schemaFromHint(hint?: string): unknown {
	const properties: Record<string, { type: string }> = {};
	if (hint) {
		try {
			const ex = JSON.parse(hint);
			for (const [k, v] of Object.entries(ex)) {
				properties[k] = { type: typeof v === 'number' ? 'number' : typeof v === 'boolean' ? 'boolean' : 'string' };
			}
		} catch { /* kein gültiges JSON → leeres Schema */ }
	}
	return { type: 'object', properties, additionalProperties: true };
}

/** Aktive Code-Add-ons als KI-Werkzeuge + Lookup-Map (Tool-Name → Manifest). */
export function buildAddonTools(): { tools: AddonTool[]; byName: Map<string, CodeManifest> } {
	const tools: AddonTool[] = [];
	const byName = new Map<string, CodeManifest>();
	for (const p of listPlugins()) {
		if (p.type !== 'agent-tool' || !p.enabled) continue;
		const full = getPlugin(p.id) as CodeManifest | null;
		if (!full?.code) continue;
		const name = p.id.replace(/[^a-z0-9_]/g, '_');
		byName.set(name, full);
		tools.push({
			type: 'function',
			function: {
				name,
				description: (p.description ?? p.name) + (full.inputHint ? ` Beispiel-Eingabe: ${full.inputHint}` : ''),
				parameters: schemaFromHint(full.inputHint)
			}
		});
	}
	return { tools, byName };
}

/** Führt ein von der KI aufgerufenes Werkzeug in der Sandbox aus. */
export async function runAddonTool(byName: Map<string, CodeManifest>, name: string, args: unknown): Promise<unknown> {
	const addon = byName.get(name);
	if (!addon) return { error: 'Unbekanntes Werkzeug: ' + name };
	const res = await runCodeAddon(addon.code, args, 5000);
	return res.ok ? res.output : { error: res.error };
}

// --- Eingebaute Werkzeuge: Kalender (immer für die KI verfügbar) ---
import { listEvents, createEvent, updateEvent, deleteEvent } from './calendar';

export function buildBuiltinTools(): AddonTool[] {
	return [
		{ type: 'function', function: { name: 'calendar_list', description: 'Termine im Kalender einsehen. Optional nach Datumsbereich filtern (Format YYYY-MM-DD).', parameters: { type: 'object', properties: { from: { type: 'string', description: 'Startdatum YYYY-MM-DD' }, to: { type: 'string', description: 'Enddatum YYYY-MM-DD' } } } } },
		{ type: 'function', function: { name: 'calendar_create', description: 'Einen neuen Termin im Kalender erstellen.', parameters: { type: 'object', properties: { title: { type: 'string' }, date: { type: 'string', description: 'YYYY-MM-DD' }, time: { type: 'string', description: 'HH:MM (optional)' }, notes: { type: 'string' } }, required: ['title', 'date'] } } },
		{ type: 'function', function: { name: 'calendar_update', description: 'Einen bestehenden Termin ändern. Die id kommt aus calendar_list.', parameters: { type: 'object', properties: { id: { type: 'string' }, title: { type: 'string' }, date: { type: 'string' }, time: { type: 'string' }, notes: { type: 'string' } }, required: ['id'] } } },
		{ type: 'function', function: { name: 'calendar_delete', description: 'Einen Termin löschen. Die id kommt aus calendar_list.', parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } } }
	];
}

export function isBuiltinTool(name: string): boolean {
	return name.startsWith('calendar_');
}

export function runBuiltinTool(name: string, args: any): unknown {
	try {
		if (name === 'calendar_list') return { events: listEvents(args?.from, args?.to) };
		if (name === 'calendar_create') return { event: createEvent(args?.title, args?.date, args?.time, args?.notes) };
		if (name === 'calendar_update') return { event: updateEvent(args?.id, args ?? {}) };
		if (name === 'calendar_delete') return { ok: deleteEvent(args?.id) };
	} catch (e) {
		return { error: e instanceof Error ? e.message : 'Fehler' };
	}
	return { error: 'Unbekanntes Werkzeug' };
}
