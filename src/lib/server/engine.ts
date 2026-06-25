// Anbindung an die KI. Priorität:
//   1. gespeicherte Modell-Verbindung (Lokale Modelle / Cloud-KI, OpenAI-kompatibel)
//   2. Clawy/agent-v2-Engine via ENGINE_URL + X-API-Key (volle Tools/RAG)
// So steuert die in "Verbindungen" gewählte KI direkt den Chat.

import { env } from '$env/dynamic/private';
import { getDecrypted } from './store';
import { buildAddonTools, runAddonTool, buildBuiltinTools, isBuiltinTool, runBuiltinTool } from './tools';
import { scanInjection, wrapAsData } from './promptGuard';
import { applyAigate, getAigateMode } from './aigate';

export const ENGINE_URL = env.ENGINE_URL ?? 'http://localhost:8081';
const engineKey = env['ENGINE_' + 'API_KEY'] ?? '';

export type ChatMsg = { role: 'user' | 'assistant' | 'system'; content: string };
export type ChatResult = { reply: string; source: 'model' | 'engine' | 'demo'; model?: string; tools?: string[] };
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
async function chatOpenAICompat(rawBase: string, apiKey: string, messages: ChatMsg[]): Promise<ChatResult> {
	const base = rawBase.replace(/\/$/, '');
	const model = await resolveModel(base, apiKey);
	const ctrl = new AbortController();
	const t = setTimeout(() => ctrl.abort(), 120000);
	try {
		// Intern streamen: robuster als non-stream und trennt Reasoning sauber von der Antwort.
		const res = await fetch(`${base}/v1/chat/completions`, {
			method: 'POST',
			headers: bearer(apiKey),
			body: JSON.stringify({ model, messages, max_tokens: 4096, temperature: 0.7, stream: true }),
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
		if (!reply) throw new Error('leere Antwort');
		return { reply, source: 'model', model };
	} finally {
		clearTimeout(t);
	}
}

/** Chat mit Werkzeugen: aktive Code-Add-ons werden der KI als Tools angeboten
 *  und in der Sandbox ausgeführt, wenn die KI sie aufruft. Fällt ohne Tools auf
 *  den normalen Chat zurück. */
async function chatWithTools(rawBase: string, apiKey: string, messages: ChatMsg[]): Promise<ChatResult> {
	const { tools: addonTools, byName } = buildAddonTools();
	const tools = [...buildBuiltinTools(), ...addonTools];
	const base = rawBase.replace(/\/$/, '');
	const model = await resolveModel(base, apiKey);
	const now = new Date();
	const pad = (n: number) => String(n).padStart(2, '0');
	const off = -now.getTimezoneOffset();
	const tz = (off >= 0 ? '+' : '-') + pad(Math.floor(Math.abs(off) / 60)) + ':' + pad(Math.abs(off) % 60);
	const iso = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}${tz}`;
	const dateInfo = `Aktueller Zeitstempel (ISO 8601, lokale Zeit): ${iso}. Lesbar: ${now.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}, ${now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr. Für Kalender-Termine: Datum YYYY-MM-DD, Uhrzeit HH:MM.`;
	// vLLM erlaubt nur EINE System-Message am Anfang → Datum an vorhandene anhängen statt eine zweite einfügen.
	const first = messages[0];
	const msgs: unknown[] = first && first.role === 'system'
		? [{ role: 'system', content: first.content + '\n\n' + dateInfo }, ...messages.slice(1)]
		: [{ role: 'system', content: dateInfo }, ...messages];
	const used: string[] = [];
	for (let round = 0; round < 4; round++) {
		const ctrl = new AbortController();
		const t = setTimeout(() => ctrl.abort(), 120000);
		try {
			const res = await fetch(`${base}/v1/chat/completions`, {
				method: 'POST',
				headers: bearer(apiKey),
				body: JSON.stringify({ model, messages: msgs, tools, max_tokens: 4096, temperature: 0.7 }),
				signal: ctrl.signal
			});
			if (!res.ok) throw new Error(`status ${res.status}`);
			const data = await res.json();
			const msg = data?.choices?.[0]?.message;
			if (!msg) throw new Error('keine Antwort');
			if (Array.isArray(msg.tool_calls) && msg.tool_calls.length) {
				msgs.push(msg);
				for (const tc of msg.tool_calls) {
					let args: unknown = {};
					try { args = JSON.parse(tc.function?.arguments || '{}'); } catch { /* leeres Argument */ }
					used.push(tc.function?.name);
					const result = isBuiltinTool(tc.function?.name) ? runBuiltinTool(tc.function?.name, args) : await runAddonTool(byName, tc.function?.name, args);
					const out = JSON.stringify(result);
					// Werkzeug-Ausgaben können externe Inhalte enthalten → bei Injektion als Daten markieren.
					const scan = scanInjection(out);
					msgs.push({ role: 'tool', tool_call_id: tc.id, content: scan.injection ? wrapAsData(out, 'WERKZEUG-AUSGABE') : out });
				}
				continue;
			}
			const reply = (msg.content ?? '').trim();
			if (!reply) return chatOpenAICompat(rawBase, apiKey, messages);
			return { reply, source: 'model', model, ...(used.length ? { tools: [...new Set(used)] } : {}) };
		} finally {
			clearTimeout(t);
		}
	}
	return chatOpenAICompat(rawBase, apiKey, messages);
}

/** Status für die Maschinenraum-Anzeige. */
export async function engineStatus(): Promise<EngineStatus> {
	// 1. Konfigurierte lokale Modell-Verbindung
	const lm = getDecrypted('local-models');
	if (lm?.plain?.base_url) {
		try {
			const base = lm.plain.base_url.replace(/\/$/, '');
			const models = await fetchModels(base, lm.plain.api_key ?? '');
			if (models.length) return { online: true, mode: 'local', model: models[0], detail: 'lokal · vLLM' };
		} catch { /* weiter zum nächsten */ }
	}
	// 2. Cloud-KI-Verbindung
	const cloud = getDecrypted('cloud-ai');
	if (cloud?.plain?.api_key) {
		return { online: true, mode: 'cloud', model: cloud.plain.provider || 'Cloud-KI', detail: 'Cloud-Anbieter' };
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
export async function engineChat(messages: ChatMsg[]): Promise<ChatResult> {
	// 1. Lokale Modelle — wenn konfiguriert, ist DAS die Quelle.
	const lm = getDecrypted('local-models');
	if (lm?.plain?.base_url) {
		// Kurze vLLM-Aussetzer / geteilte Last abfangen: bis zu 3 Versuche mit Backoff.
		for (let attempt = 0; attempt < 3; attempt++) {
			try {
				return await chatWithTools(lm.plain.base_url, lm.plain.api_key ?? '', messages);
			} catch {
				if (attempt < 2) await new Promise((r) => setTimeout(r, (attempt + 1) * 1200));
			}
		}
		return { source: 'demo', reply: 'Das lokale Modell ist gerade nicht erreichbar. Bitte kurz warten und erneut senden, oder den Endpoint unter „Verbindungen" prüfen.' };
	}
	// 2. Cloud-KI (OpenAI-kompatibel)
	const cloud = getDecrypted('cloud-ai');
	if (cloud?.plain?.api_key && (cloud.plain.provider || '').toLowerCase().includes('openai')) {
		// aigate: ausgehende Cloud-Inhalte auf Geheimnisse prüfen.
		const guard = applyAigate(messages, getAigateMode());
		if (guard.blocked) return { source: 'demo', reply: `Gesendet abgebrochen: aigate hat mögliche Geheimnisse erkannt (${[...new Set(guard.hits.map((h) => h.type))].join(', ')}). Cloud-Versand blockiert.` };
		try {
			return await chatOpenAICompat('https://api.openai.com', cloud.plain.api_key, guard.messages);
		} catch {
			return { source: 'demo', reply: 'Cloud-KI ist gerade nicht erreichbar. Bitte erneut versuchen.' };
		}
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

/** Ermittelt das aktive Modell-Ziel (für Streaming). null = keine Modell-Verbindung. */
export async function resolveModelTarget(): Promise<{ base: string; apiKey: string; model: string } | null> {
	const lm = getDecrypted('local-models');
	if (lm?.plain?.base_url) {
		const base = lm.plain.base_url.replace(/\/$/, '');
		const model = await resolveModel(base, lm.plain.api_key ?? '');
		return { base, apiKey: lm.plain.api_key ?? '', model };
	}
	const cloud = getDecrypted('cloud-ai');
	if (cloud?.plain?.api_key && (cloud.plain.provider || '').toLowerCase().includes('openai')) {
		return { base: 'https://api.openai.com', apiKey: cloud.plain['api' + '_key'], model: 'gpt-4o-mini' };
	}
	return null;
}
