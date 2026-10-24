// Anbindung an die KI. Priorität:
//   1. gespeicherte Modell-Verbindung (Lokale Modelle / Cloud-KI, OpenAI-kompatibel)
//   2. Clawy/agent-v2-Engine via ENGINE_URL + X-API-Key (volle Tools/RAG)
// So steuert die in "Verbindungen" gewählte KI direkt den Chat.

import { env } from '$env/dynamic/private';
import { getDecrypted } from './store';
import { buildToolCatalog, executeTool, toAnthropicTools } from './tools';
import { execution, operator } from './runtime/context';
import { runtimeStore } from './runtime';
import { getActiveId } from './companies';
import { scanInjection, wrapAsData } from './promptGuard';
import { applyAigate, getAigateMode } from './aigate';
import { getKiSource } from './kiSource';
import { getSelectedModel, type SelectedModel } from './models';
import type { GeneratedAddon } from './addonGen';

export const ENGINE_URL = env.ENGINE_URL ?? 'http://localhost:8081';
const engineKey = env['ENGINE_' + 'API_KEY'] ?? '';

export type ChatMsg = { role: 'user' | 'assistant' | 'system'; content: string };
export type PendingMail = { to: string; subject: string; text: string };
export type PendingMessage = { channel: string; recipient: string; text: string };
export type PendingAddon = GeneratedAddon;
export type ChatResult = { reply: string; source: 'model' | 'engine' | 'demo'; model?: string; tools?: string[]; pendingMail?: PendingMail; pendingMessage?: PendingMessage; pendingAddon?: PendingAddon; runId?: string; pendingTools?: { id: string; name: string; reason: string }[] };

// Hinweis an die KI: bei fehlender Fähigkeit ein Add-on vorschlagen statt nur abzulehnen.
// Wird an den System-Kontext der werkzeugfähigen Pfade angehängt.
const TOOL_GUIDANCE =
	'Hinweis: Fehlt dir für eine Anfrage eine konkrete Fähigkeit (z. B. eine bestimmte externe API abfragen oder Daten umwandeln), ' +
	'kannst du mit dem Werkzeug „addon_erstellen" ein passendes Astoris-Code-Add-on vorschlagen und bauen lassen — beschreibe darin in einem Satz, was das Add-on tun soll. ' +
	'Der Nutzer bestätigt die Erstellung selbst. Nutze das nur, wenn wirklich eine Fähigkeit fehlt, nicht für Aufgaben, die du direkt erledigen kannst.';
export type EngineStatus = {
	online: boolean;
	mode: 'local' | 'cloud' | 'offline';
	model: string;
	detail: string;
};

function bearer(apiKey: string): Record<string, string> {
	const h: Record<string, string> = { 'content-type': 'application/json' };
	if (apiKey) h['authorization'] = 'Bearer ' + apiKey;
	return h;
}

let cachedModel = '';
async function fetchModels(base: string, apiKey: string): Promise<string[]> {
	const ctrl = new AbortController();
	const t = setTimeout(() => ctrl.abort(), 4000);
	try {
		const res = await fetch(`${base}/v1/models`, { headers: bearer(apiKey), signal: ctrl.signal });
		if (!res.ok) return [];
		const data = await res.json();
		return (data?.data ?? []).map((m: { id: string }) => m.id);
	} catch {
		return [];
	} finally {
		clearTimeout(t);
	}
}

// Modellname einmal ermitteln und cachen → robust gegen kurze /v1/models-Aussetzer.
async function resolveModel(base: string, apiKey: string): Promise<string> {
	if (cachedModel) return cachedModel;
	const m = await fetchModels(base, apiKey);
	if (m[0]) cachedModel = m[0];
	return cachedModel || 'default';
}

/** OpenAI-kompatibler Chat (vLLM/Ollama/OpenAI). */
async function chatOpenAICompat(rawBase: string, apiKey: string, messages: ChatMsg[], noThink = false): Promise<ChatResult> {
	const base = rawBase.replace(/\/$/, '');
	const model = await resolveModel(base, apiKey);
	const ctrl = new AbortController();
	const t = setTimeout(() => ctrl.abort(), 120000);
	try {
		// Intern streamen: robuster als non-stream und trennt Reasoning sauber von der Antwort.
		const res = await fetch(`${base}/v1/chat/completions`, {
			method: 'POST',
			headers: bearer(apiKey),
			body: JSON.stringify({ model, messages, max_tokens: 4096, temperature: noThink ? 0.3 : 0.7, stream: true, ...(noThink ? { chat_template_kwargs: { enable_thinking: false } } : {}) }),
			signal: ctrl.signal
		});
		if (!res.ok || !res.body) throw new Error(`status ${res.status}`);
		const reader = res.body.getReader();
		const dec = new TextDecoder();
		let buf = '';
		let content = '';
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			buf += dec.decode(value, { stream: true });
			const lines = buf.split('\n');
			buf = lines.pop() ?? '';
			for (const line of lines) {
				const tt = line.trim();
				if (!tt.startsWith('data:')) continue;
				const payload = tt.slice(5).trim();
				if (!payload || payload === '[DONE]') continue;
				try {
					const d = JSON.parse(payload);
					const delta = d?.choices?.[0]?.delta ?? {};
					if (delta.content) content += delta.content; // reasoning bewusst ignorieren
				} catch { /* unvollständiges JSON */ }
			}
		}
		const reply = content.trim();
		// Reasoning models can spend the whole token budget on thinking and return no content.
		// Retry once with reasoning off instead of reporting the model as unreachable.
		if (!reply && !noThink) return chatOpenAICompat(rawBase, apiKey, messages, true);
		if (!reply) throw new Error('leere Antwort');
		return { reply, source: 'model', model };
	} finally {
		clearTimeout(t);
	}
}

/** Chat mit Werkzeugen: aktive Code-Add-ons werden der KI als Tools angeboten
 *  und in der Sandbox ausgeführt, wenn die KI sie aufruft. Fällt ohne Tools auf
 *  den normalen Chat zurück. */
async function chatWithTools(rawBase: string, apiKey: string, messages: ChatMsg[], allowedTools?: string[], noThink = false): Promise<ChatResult> {
	const { tools: allTools, byName, mcp } = await buildToolCatalog(allowedTools);
	const tools = allowedTools !== undefined ? allTools.filter((t) => allowedTools.includes(t.function.name)) : allTools;
	const offered = new Set(tools.map((t) => t.function.name));
	// vLLM lehnt ein leeres tools-Array mit 400 ab. Ohne Werkzeuge -> direkter Chat (z. B. Add-on-Generierung).
	if (!tools.length) return chatOpenAICompat(rawBase, apiKey, messages, noThink);
	const base = rawBase.replace(/\/$/, '');
	const model = await resolveModel(base, apiKey);
	const now = new Date();
	const pad = (n: number) => String(n).padStart(2, '0');
	const off = -now.getTimezoneOffset();
	const tz = (off >= 0 ? '+' : '-') + pad(Math.floor(Math.abs(off) / 60)) + ':' + pad(Math.abs(off) % 60);
	const iso = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}${tz}`;
	const dateInfo = `Aktueller Zeitstempel (ISO 8601, lokale Zeit): ${iso}. Lesbar: ${now.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}, ${now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr. Für Kalender-Termine: Datum YYYY-MM-DD, Uhrzeit HH:MM.`;
	// vLLM erlaubt nur EINE System-Message am Anfang → Datum an vorhandene anhängen statt eine zweite einfügen.
	// Werkzeug-Hinweis nur, wenn tatsächlich Werkzeuge angeboten werden (nicht in werkzeugfreien Runden, z. B. Add-on-Generierung).
	const sysExtra = dateInfo + (tools.length ? '\n\n' + TOOL_GUIDANCE : '');
	const first = messages[0];
	const msgs: unknown[] = first && first.role === 'system'
		? [{ role: 'system', content: first.content + '\n\n' + sysExtra }, ...messages.slice(1)]
		: [{ role: 'system', content: sysExtra }, ...messages];
	const used: string[] = [];
	let pendingMail: PendingMail | undefined;
	let pendingMessage: PendingMessage | undefined;
	let pendingAddon: PendingAddon | undefined;
	let thinkOff = noThink;
	for (let round = 0; round < 4; round++) {
		const ctrl = new AbortController();
		const t = setTimeout(() => ctrl.abort(), 120000);
		try {
			const res = await fetch(`${base}/v1/chat/completions`, {
				method: 'POST',
				headers: bearer(apiKey),
				body: JSON.stringify({ model, messages: msgs, tools, max_tokens: 4096, temperature: thinkOff ? 0.3 : 0.7, ...(thinkOff ? { chat_template_kwargs: { enable_thinking: false } } : {}) }),
				signal: ctrl.signal
			});
			if (!res.ok) throw new Error(`status ${res.status}`);
			const data = await res.json();
			const msg = data?.choices?.[0]?.message;
			if (!msg) throw new Error('keine Antwort');
			if (Array.isArray(msg.tool_calls) && msg.tool_calls.length) {
				msgs.push(msg);
				const pendingTools: { id: string; name: string; reason: string }[] = [];
				for (const tc of msg.tool_calls) {
					let args: unknown = {};
					try { args = JSON.parse(tc.function?.arguments || '{}'); } catch { args = null; }
					used.push(tc.function?.name);
					const result = await executeTool(tc.function?.name ?? '', args, offered, byName, mcp);
					if (result && typeof result === 'object' && 'pendingTool' in result) {
						pendingTools.push(result.pendingTool as { id: string; name: string; reason: string });
					}
					if (result && typeof result === 'object' && 'pendingMail' in result) pendingMail = (result as { pendingMail: PendingMail }).pendingMail;
					if (result && typeof result === 'object' && 'pendingMessage' in result) pendingMessage = (result as { pendingMessage: PendingMessage }).pendingMessage;
					if (result && typeof result === 'object' && 'pendingAddon' in result) pendingAddon = (result as { pendingAddon: PendingAddon }).pendingAddon;
					const out = JSON.stringify(result);
					// Werkzeug-Ausgaben können externe Inhalte enthalten → bei Injektion als Daten markieren.
					const scan = scanInjection(out);
					msgs.push({ role: 'tool', tool_call_id: tc.id, content: scan.injection ? wrapAsData(out, 'WERKZEUG-AUSGABE') : out });
				}
				if (pendingTools.length) return { reply: 'Die vorgeschlagenen Aktionen warten unter [Entscheidungen](/entscheidungen) auf deine Freigabe.', source: 'model', model,
					tools: [...new Set(used)], pendingTools, pendingMail, pendingMessage, pendingAddon };
				continue;
			}
			const reply = (msg.content ?? '').trim();
			// Empty answer because reasoning used the whole budget: retry this round without reasoning.
			if (!reply && !thinkOff && data?.choices?.[0]?.finish_reason === 'length') { thinkOff = true; continue; }
			// No text and no tool ran: report failure honestly instead of a fake "tool execution finished".
			if (!reply && !used.length) throw new Error('leere Antwort');
			if (!reply) return { reply: 'Werkzeug-Ausführung abgeschlossen. Bitte prüfe das Ergebnis im Laufprotokoll.', source: 'model', model, tools: [...new Set(used)], pendingMail, pendingMessage, pendingAddon };
			return { reply, source: 'model', model, ...(used.length ? { tools: [...new Set(used)] } : {}), ...(pendingMail ? { pendingMail } : {}), ...(pendingMessage ? { pendingMessage } : {}), ...(pendingAddon ? { pendingAddon } : {}) };
		} finally {
			clearTimeout(t);
		}
	}
	return { reply: 'Das Limit der Werkzeug-Runden wurde erreicht. Bereits ausgeführte Aktionen stehen im Laufprotokoll.', source: 'model', model, tools: [...new Set(used)], pendingMail, pendingMessage, pendingAddon };
}

/** Aktueller Datums-/Zeit-Kontext (ISO 8601, lokal) — für die KI. */
function nowContext(): string {
	const now = new Date();
	const pad = (n: number) => String(n).padStart(2, '0');
	const off = -now.getTimezoneOffset();
	const tz = (off >= 0 ? '+' : '-') + pad(Math.floor(Math.abs(off) / 60)) + ':' + pad(Math.abs(off) % 60);
	const iso = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}${tz}`;
	return `Aktueller Zeitstempel (ISO 8601, lokale Zeit): ${iso}. Lesbar: ${now.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}, ${now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr. Für Kalender-Termine: Datum YYYY-MM-DD, Uhrzeit HH:MM.`;
}

/** Anthropic Claude — mit Tool-Calling (tool_use/tool_result), gleiches Werkzeug-Set wie lokal. */
async function chatAnthropic(apiKey: string, messages: ChatMsg[], model = 'claude-sonnet-4-6', allowedTools?: string[]): Promise<ChatResult> {
	const { tools: allTools, byName, mcp } = await buildToolCatalog(allowedTools);
	const filtered = allowedTools !== undefined ? allTools.filter((t) => allowedTools.includes(t.function.name)) : allTools;
	const offered = new Set(filtered.map((t) => t.function.name));
	const anthropicTools = toAnthropicTools(filtered);
	const sysBase = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
	const system = (sysBase ? sysBase + '\n\n' : '') + nowContext() + (anthropicTools.length ? '\n\n' + TOOL_GUIDANCE : '');
	const msgs: unknown[] = messages.filter((m) => m.role !== 'system').map((m) => ({ role: m.role, content: m.content }));
	const used: string[] = [];
	let pendingMail: PendingMail | undefined;
	let pendingMessage: PendingMessage | undefined;
	let pendingAddon: PendingAddon | undefined;
	for (let round = 0; round < 4; round++) {
		const ctrl = new AbortController();
		const t = setTimeout(() => ctrl.abort(), 120000);
		try {
			const res = await fetch('https://api.anthropic.com/v1/messages', {
				method: 'POST',
				headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
				body: JSON.stringify({ model, max_tokens: 4096, system, messages: msgs, tools: anthropicTools }),
				signal: ctrl.signal
			});
			if (!res.ok) throw new Error(`anthropic status ${res.status}`);
			const data = await res.json();
			const content = (data?.content ?? []) as { type?: string; text?: string; id?: string; name?: string; input?: unknown }[];
			const toolUses = content.filter((b) => b.type === 'tool_use');
			if (toolUses.length) {
				msgs.push({ role: 'assistant', content });
				const results = [];
				const pendingTools: { id: string; name: string; reason: string }[] = [];
				for (const tu of toolUses) {
					used.push(tu.name ?? '');
					const r = await executeTool(tu.name ?? '', tu.input, offered, byName, mcp);
					if (r && typeof r === 'object' && 'pendingTool' in r) {
						pendingTools.push(r.pendingTool as { id: string; name: string; reason: string });
					}
					if (r && typeof r === 'object' && 'pendingMail' in r) pendingMail = (r as { pendingMail: PendingMail }).pendingMail;
					if (r && typeof r === 'object' && 'pendingMessage' in r) pendingMessage = (r as { pendingMessage: PendingMessage }).pendingMessage;
					if (r && typeof r === 'object' && 'pendingAddon' in r) pendingAddon = (r as { pendingAddon: PendingAddon }).pendingAddon;
					results.push({ type: 'tool_result', tool_use_id: tu.id, content: JSON.stringify(r) });
				}
				if (pendingTools.length) return { reply: 'Die vorgeschlagenen Aktionen warten unter [Entscheidungen](/entscheidungen) auf deine Freigabe.', source: 'model', model,
					tools: [...new Set(used)], pendingTools, pendingMail, pendingMessage, pendingAddon };
				msgs.push({ role: 'user', content: results });
				continue;
			}
			const reply = content.filter((b) => b.type === 'text').map((b) => b.text ?? '').join('').trim();
			if (!reply) throw new Error('leere Antwort');
			return { reply, source: 'model', model: data.model ?? model, ...(used.length ? { tools: [...new Set(used)] } : {}), ...(pendingMail ? { pendingMail } : {}), ...(pendingMessage ? { pendingMessage } : {}), ...(pendingAddon ? { pendingAddon } : {}) };
		} finally {
			clearTimeout(t);
		}
	}
	return { reply: 'Das Limit der Werkzeug-Runden wurde erreicht. Bereits ausgeführte Aktionen stehen im Laufprotokoll.', source: 'model', model, tools: [...new Set(used)], pendingMail, pendingMessage, pendingAddon };
}

/** Status für die Maschinenraum-Anzeige. Spiegelt Modell-Wahl + KI-Quelle. */
export async function engineStatus(): Promise<EngineStatus> {
	const sel = getSelectedModel();
	const lm = getDecrypted('local-models');
	const cloud = getDecrypted('cloud-ai');
	const preferCloud = sel ? sel.source === 'cloud' : getKiSource() === 'cloud';

	// Cloud bevorzugt (Modell-Wahl oder Quelle) und konfiguriert → Cloud anzeigen.
	if (preferCloud && cloud?.plain?.api_key) {
		return { online: true, mode: 'cloud', model: sel?.model || cloud.plain.provider || 'Cloud-KI', detail: cloud.plain.provider ? `Cloud · ${cloud.plain.provider}` : 'Cloud-Anbieter' };
	}
	// 1. Konfigurierte lokale Modell-Verbindung
	if (lm?.plain?.base_url) {
		try {
			const base = lm.plain.base_url.replace(/\/$/, '');
			const models = await fetchModels(base, lm.plain.api_key ?? '');
			if (models.length) return { online: true, mode: 'local', model: models[0], detail: 'lokal · vLLM' };
		} catch { /* weiter zum nächsten */ }
	}
	// 2. Cloud-KI als Fallback
	if (cloud?.plain?.api_key) {
		return { online: true, mode: 'cloud', model: sel?.model || cloud.plain.provider || 'Cloud-KI', detail: 'Cloud-Anbieter' };
	}
	// 3. Clawy-Engine
	try {
		const ctrl = new AbortController();
		const t = setTimeout(() => ctrl.abort(), 2500);
		const res = await fetch(`${ENGINE_URL}/health`, { headers: bearer(engineKey), signal: ctrl.signal });
		clearTimeout(t);
		if (res.ok) return { online: true, mode: 'local', model: 'Clawy-Engine', detail: 'lokal · GB10' };
	} catch { /* offline */ }
	return { online: false, mode: 'offline', model: 'keine Engine', detail: 'nicht verbunden' };
}

/** Chat. Nutzt die konfigurierte Modell-Verbindung; bei deren Ausfall klare Meldung
 *  (KEIN Clawy-Fallback, der wäre irreführend). Clawy nur, wenn nichts konfiguriert ist. */
export async function engineChat(messages: ChatMsg[], override?: SelectedModel | null, allowedTools?: string[], options?: { autonomy?: number; agentId?: string }): Promise<ChatResult> {
	if (execution.getStore()) return engineChatInner(messages, override, allowedTools);
	const store = runtimeStore();
	const owner = operator.getStore() ?? 'system';
	const companyId = getActiveId();
	const run = store.create({ companyId, owner, agentId: options?.agentId,
		title: [...messages].reverse().find((m) => m.role === 'user')?.content.slice(0, 160) ?? 'KI-Aufgabe' });
	store.transition(run.id, 'running', owner);
	return execution.run({ runId: run.id, companyId, owner, autonomy: options?.autonomy ?? 3, effectsStarted: false }, async () => {
		try {
			const result = await engineChatInner(messages, override, allowedTools);
			if (store.get(run.id)?.status === 'running') store.transition(run.id,
				result.pendingTools?.length ? 'waiting_for_approval' : result.source === 'demo' ? 'failed' : 'completed', owner, { result });
			return { ...result, runId: run.id };
		} catch (e) {
			if (store.get(run.id)?.status === 'running') store.transition(run.id, 'failed', owner, { error: 'KI-Lauf fehlgeschlagen. Bereits ausgeführte Aktionen im Protokoll prüfen.' });
			throw e;
		}
	});
}

async function engineChatInner(messages: ChatMsg[], override?: SelectedModel | null, allowedTools?: string[]): Promise<ChatResult> {
	// Add-on-Generierung (NO_TOOLS-Sentinel) -> Reasoning aus: lokale Modelle liefern sonst erst nach Minuten -> Timeout.
	const noThink = !!allowedTools?.includes('__addongen_no_tools__');
	// 0. Cloud zuerst? Modell-Override (z. B. pro Agent) > globale Wahl > KI-Quelle.
	const sel = override ?? getSelectedModel();
	if (sel ? sel.source === 'cloud' : getKiSource() === 'cloud') {
		const c = getDecrypted('cloud-ai');
		if (c?.plain?.api_key) {
			const prov = (c.plain.provider || '').toLowerCase();
			const g = applyAigate(messages, getAigateMode());
			if (g.blocked) return { source: 'demo', reply: `Gesendet abgebrochen: aigate hat mögliche Geheimnisse erkannt (${[...new Set(g.hits.map((h) => h.type))].join(', ')}).` };
			try {
				if (prov.includes('anthropic') || prov.includes('claude')) return await chatAnthropic(c.plain.api_key, g.messages, sel?.model || undefined, allowedTools);
				if (prov.includes('openai')) return await chatWithTools('https://api.openai.com', c.plain.api_key, g.messages, allowedTools, noThink);
			} catch (e) { if (execution.getStore()?.effectsStarted) throw e; }
		}
	}

	// 1. Lokale Modelle — wenn konfiguriert, ist DAS die Quelle.
	const lm = getDecrypted('local-models');
	if (lm?.plain?.base_url) {
		// Kurze vLLM-Aussetzer / geteilte Last abfangen: bis zu 3 Versuche mit Backoff.
		for (let attempt = 0; attempt < 3; attempt++) {
			try {
				return await chatWithTools(lm.plain.base_url, lm.plain.api_key ?? '', messages, allowedTools, noThink);
			} catch (e) {
				if (execution.getStore()?.effectsStarted) throw e;
				if (attempt < 2) await new Promise((r) => setTimeout(r, (attempt + 1) * 1200));
			}
		}
		return { source: 'demo', reply: 'Das lokale Modell ist gerade nicht erreichbar. Bitte kurz warten und erneut senden, oder den Endpoint unter „Verbindungen" prüfen.' };
	}
	// 2. Cloud-KI (Anthropic Claude oder OpenAI)
	const cloud = getDecrypted('cloud-ai');
	if (cloud?.plain?.api_key) {
		const provider = (cloud.plain.provider || '').toLowerCase();
		// aigate: ausgehende Cloud-Inhalte auf Geheimnisse prüfen.
		const guard = applyAigate(messages, getAigateMode());
		if (guard.blocked) return { source: 'demo', reply: `Gesendet abgebrochen: aigate hat mögliche Geheimnisse erkannt (${[...new Set(guard.hits.map((h) => h.type))].join(', ')}). Cloud-Versand blockiert.` };
		if (provider.includes('anthropic') || provider.includes('claude')) {
			try {
				return await chatAnthropic(cloud.plain.api_key, guard.messages, sel?.model || undefined, allowedTools);
			} catch (e) {
				if (execution.getStore()?.effectsStarted) throw e;
				return { source: 'demo', reply: 'Cloud-KI (Claude) ist gerade nicht erreichbar. Bitte erneut versuchen.' };
			}
		}
		if (provider.includes('openai')) {
			try {
				return await chatWithTools('https://api.openai.com', cloud.plain.api_key, guard.messages, allowedTools, noThink);
			} catch (e) {
				if (execution.getStore()?.effectsStarted) throw e;
				return { source: 'demo', reply: 'Cloud-KI ist gerade nicht erreichbar. Bitte erneut versuchen.' };
			}
		}
	}
	// External engines cannot enforce Astoris tool allowlists or approvals.
	if (allowedTools !== undefined || (execution.getStore()?.autonomy ?? 3) < 4) {
		return { source: 'demo', reply: 'Bitte eine Modell-Verbindung einrichten. Die externe Engine unterstützt keine kontrollierte Astoris-Werkzeugfreigabe.' };
	}
	// 3. Clawy-Engine via env — nur wenn KEINE Modell-Verbindung konfiguriert ist.
	try {
		const lastUser = [...messages].reverse().find((m) => m.role === 'user')?.content ?? '';
		const ctrl = new AbortController();
		const t = setTimeout(() => ctrl.abort(), 120000);
		const res = await fetch(`${ENGINE_URL}/chat`, {
			method: 'POST',
			headers: bearer(engineKey),
			body: JSON.stringify({ message: lastUser, mode: 'arbeit' }),
			signal: ctrl.signal
		});
		clearTimeout(t);
		if (res.ok) {
			const data = await res.json();
			const reply = String(data.answer ?? data.reply ?? '').trim();
			if (reply) return { reply, source: 'engine', model: 'Clawy' };
		}
	} catch { /* demo */ }

	return {
		source: 'demo',
		reply: 'Noch keine KI verbunden. Richte unter „Verbindungen → Lokale Modelle" deinen Endpoint ein (z. B. http://localhost:8000).'
	};
}
