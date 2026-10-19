// Verbindet Code-Add-ons (agent-tool) mit dem KI-Chat: aktive Add-ons werden
// der KI als aufrufbare Werkzeuge (OpenAI tool-calling) angeboten und in der
// Sandbox ausgeführt, wenn die KI sie aufruft.

import { listPlugins, getPlugin } from './plugins';
import { runCodeAddon } from './sandbox';
import { getPluginConfig } from './pluginConfig';
import type { CodeManifest } from '$lib/plugins/types';
import { dispatchTool, executePrepared, toolFingerprint } from './runtime/pipeline';
import { runtimeStore } from './runtime';
import { buildMcpTools, runMcpTool, type McpTool } from './mcp';

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
	// Gespeicherte Add-on-Config (API-Keys) in den Input mischen — Args der KI haben Vorrang.
	const config = getPluginConfig(addon.id);
	const merged = { ...config, ...(args && typeof args === 'object' ? (args as Record<string, unknown>) : {}) };
	const res = await runCodeAddon(addon.code, merged, 5000);
	return res.ok ? res.output : { error: res.error };
}

// --- Eingebaute Werkzeuge: Kalender (immer für die KI verfügbar) ---
import { listEvents, createEvent, updateEvent, deleteEvent } from './calendar';

export function buildBuiltinTools(): AddonTool[] {
	return [
		{ type: 'function', function: { name: 'calendar_list', description: 'Termine im Kalender einsehen. Optional nach Datumsbereich filtern (Format YYYY-MM-DD).', parameters: { type: 'object', properties: { from: { type: 'string', description: 'Startdatum YYYY-MM-DD' }, to: { type: 'string', description: 'Enddatum YYYY-MM-DD' } } } } },
		{ type: 'function', function: { name: 'calendar_create', description: 'Einen neuen Termin im Kalender erstellen.', parameters: { type: 'object', properties: { title: { type: 'string' }, date: { type: 'string', description: 'YYYY-MM-DD' }, time: { type: 'string', description: 'HH:MM (optional)' }, notes: { type: 'string' } }, required: ['title', 'date'] } } },
		{ type: 'function', function: { name: 'calendar_update', description: 'Einen bestehenden Termin ändern. Die id kommt aus calendar_list.', parameters: { type: 'object', properties: { id: { type: 'string' }, title: { type: 'string' }, date: { type: 'string' }, time: { type: 'string' }, notes: { type: 'string' } }, required: ['id'] } } },
		{ type: 'function', function: { name: 'calendar_delete', description: 'Einen Termin löschen. Die id kommt aus calendar_list.', parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } } },
		{ type: 'function', function: { name: 'mail_send', description: 'Eine E-Mail VORBEREITEN. Sie wird dem Nutzer zur Bestätigung angezeigt und NICHT automatisch versendet. Nutze dies, wenn der Nutzer eine Mail schreiben/senden möchte.', parameters: { type: 'object', properties: { to: { type: 'string', description: 'Empfänger-E-Mail-Adresse' }, subject: { type: 'string', description: 'Betreff' }, text: { type: 'string', description: 'Mail-Text' } }, required: ['to', 'text'] } } },
		{ type: 'function', function: { name: 'messenger_send', description: 'Eine verschlüsselte Messenger-Nachricht VORBEREITEN (Kanal: telegram/email/whatsapp/signal). Wird dem Nutzer zur Bestätigung angezeigt und erst nach client-seitiger Verschlüsselung gesendet — NICHT automatisch.', parameters: { type: 'object', properties: { channel: { type: 'string', description: 'telegram, email, whatsapp oder signal' }, recipient: { type: 'string', description: 'Empfänger-Adresse (z. B. Telegram-Chat-ID, E-Mail)' }, text: { type: 'string', description: 'Klartext der Nachricht' } }, required: ['text'] } } },
		{ type: 'function', function: { name: 'addon_erstellen', description: 'Ein neues Astoris-Code-Add-on (Werkzeug) VORSCHLAGEN, wenn dir für eine Anfrage eine Fähigkeit fehlt. Beschreibe in description in einem Satz, was das Add-on tun soll (z. B. „fragt die Wetter-API für eine Stadt ab"). Die KI generiert den Code; der Nutzer sieht einen Vorschlag mit Code-Vorschau und bestätigt die Erstellung selbst — es wird NICHTS automatisch installiert.', parameters: { type: 'object', properties: { description: { type: 'string', description: 'Was soll das neue Add-on/Werkzeug können? Ein bis zwei Sätze.' } }, required: ['description'] } } }
	];
}

export function isBuiltinTool(name: string): boolean {
	return name.startsWith('calendar_') || name === 'mail_send' || name === 'messenger_send' || name === 'addon_erstellen';
}

export async function runBuiltinTool(name: string, args: any): Promise<unknown> {
	try {
		if (name === 'calendar_list') return { events: listEvents(args?.from, args?.to) };
		if (name === 'calendar_create') return { event: createEvent(args?.title, args?.date, args?.time, args?.notes) };
		if (name === 'calendar_update') {
			const event = updateEvent(args?.id, args ?? {});
			return event ? { event } : { error: 'Termin nicht gefunden.' };
		}
		if (name === 'calendar_delete') return deleteEvent(args?.id) ? { ok: true } : { error: 'Termin nicht gefunden.' };
		if (name === 'mail_send') return { pendingMail: { to: String(args?.to ?? ''), subject: String(args?.subject ?? ''), text: String(args?.text ?? '') }, hinweis: 'Entwurf vorbereitet — der Nutzer bestätigt den Versand.' };
		if (name === 'messenger_send') return { pendingMessage: { channel: String(args?.channel ?? 'telegram'), recipient: String(args?.recipient ?? ''), text: String(args?.text ?? '') }, hinweis: 'Nachricht vorbereitet — der Nutzer bestätigt + verschlüsselt vor dem Versand.' };
		if (name === 'addon_erstellen') {
			// Dynamischer Import bricht den Zyklus engine -> tools -> addonGen -> engine auf.
			const { generateAddon } = await import('./addonGen');
			const gen = await generateAddon(String(args?.description ?? ''));
			if (!gen.ok) return { fehler: gen.message };
			// pendingAddon -> der Chat zeigt eine Karte mit Vorschau + „Erstellen"/„Verwerfen" (keine Auto-Installation).
			return { pendingAddon: gen.addon, hinweis: 'Add-on vorbereitet — der Nutzer bestätigt die Erstellung selbst.' };
		}
	} catch (e) {
		return { error: e instanceof Error ? e.message : 'Fehler' };
	}
	return { error: 'Unbekanntes Werkzeug' };
}

// Konvertiert OpenAI-Tools ins Anthropic-Format (name/description/input_schema).
export function toAnthropicTools(tools: AddonTool[]): { name: string; description: string; input_schema: unknown }[] {
	return tools.map((t) => ({ name: t.function.name, description: t.function.description, input_schema: t.function.parameters }));
}

function toolDefinition(name: string, byName: Map<string, CodeManifest>, mcp: Map<string, McpTool>) {
	if (mcp.has(name)) return mcp.get(name);
	if (isBuiltinTool(name)) return { version: 1, tool: buildBuiltinTools().find((t) => t.function.name === name) };
	const addon = byName.get(name);
	return { addon, config: addon ? getPluginConfig(addon.id) : null };
}

/** Both model providers use this boundary; model output never grants authority. */
export function executeTool(name: string, args: unknown, offered: ReadonlySet<string>, byName: Map<string, CodeManifest>, mcp: Map<string, McpTool>) {
	return dispatchTool({ name, args, offered, definition: toolDefinition(name, byName, mcp),
		invoke: () => mcp.has(name) ? runMcpTool(mcp.get(name)!, args) : isBuiltinTool(name) ? runBuiltinTool(name, args) : runAddonTool(byName, name, args) });
}

export async function buildToolCatalog(allowedTools?: string[], refresh = false) {
	const addons = buildAddonTools();
	// A failed configured MCP server must not silently hide tools or bypass its policy.
	const mcp = allowedTools !== undefined && !allowedTools.some((name) => name.startsWith('mcp_'))
		? { tools: [], byName: new Map<string, McpTool>() } : await buildMcpTools(refresh);
	return { tools: [...buildBuiltinTools(), ...addons.tools, ...mcp.tools], byName: addons.byName, mcp: mcp.byName };
}

export async function resolveToolCall(id: string, approve: boolean, actor: string) {
	const store = runtimeStore();
	const call = store.decide(id, approve, actor);
	if (!approve) { store.settle(call.runId); return call; }
	try {
		await executePrepared(call, async () => {
			const { tools, byName, mcp } = await buildToolCatalog([call.name], true);
			const available = new Set(tools.map((t) => t.function.name));
			if (!available.has(call.name) || toolFingerprint(toolDefinition(call.name, byName, mcp)) !== call.fingerprint) {
				return { error: 'Werkzeug oder Konfiguration wurde seit dem Vorschlag verändert. Bitte neu vorschlagen lassen.' };
			}
			return mcp.has(call.name) ? runMcpTool(mcp.get(call.name)!, call.args) : isBuiltinTool(call.name) ? runBuiltinTool(call.name, call.args) : runAddonTool(byName, call.name, call.args);
		}, actor);
	} finally { store.settle(call.runId); }
	return store.call(id)!;
}
