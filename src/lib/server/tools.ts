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
