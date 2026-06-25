import { error } from '@sveltejs/kit';
import { resolveModelTarget, engineChat, type ChatMsg } from '$lib/server/engine';
import { buildAddonTools } from '$lib/server/tools';
import { applyAigate, getAigateMode } from '$lib/server/aigate';

// Streamt die Modell-Antwort als SSE. Events: {type:'reasoning'|'content'|'done'|'error'}.
export async function POST({ request }) {
	const body = await request.json().catch(() => null);
	let messages: ChatMsg[] = Array.isArray(body?.messages) ? body.messages : [];
	messages = messages.filter((m) => m && typeof m.content === 'string' && m.content.trim()).slice(-20);
	if (!messages.length) throw error(400, 'message fehlt');

	const enc = new TextEncoder();

	// Sind Code-Add-ons aktiv → Tool-Calling-Pfad (KI darf Werkzeuge nutzen).
	if (buildAddonTools().tools.length > 0) {
		const result = await engineChat(messages);
		const stream = new ReadableStream({
			start(c) {
				if (result.tools?.length) c.enqueue(enc.encode(`data: ${JSON.stringify({ type: 'tools', names: result.tools })}\n\n`));
				c.enqueue(enc.encode(`data: ${JSON.stringify({ type: 'content', text: result.reply })}\n\n`));
				c.enqueue(enc.encode(`data: ${JSON.stringify({ type: 'done', model: result.model, tools: result.tools })}\n\n`));
				c.close();
			}
		});
		return new Response(stream, { headers: sseHeaders() });
	}

	const target = await resolveModelTarget();
	// aigate: Cloud-Ziele auf Geheimnisse prüfen.
	if (target && /api\.openai\.com|anthropic/i.test(target.base)) {
		const guard = applyAigate(messages, getAigateMode());
		if (guard.blocked) {
			const types = [...new Set(guard.hits.map((h) => h.type))].join(', ');
			const stream = new ReadableStream({
				start(c) {
					c.enqueue(enc.encode(`data: ${JSON.stringify({ type: 'content', text: `aigate hat mögliche Geheimnisse erkannt (${types}) — Cloud-Versand blockiert.` })}\n\n`));
					c.enqueue(enc.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`));
					c.close();
				}
			});
			return new Response(stream, { headers: sseHeaders() });
		}
		messages = guard.messages;
	}

	if (!target) {
		const stream = new ReadableStream({
			start(c) {
				c.enqueue(enc.encode(`data: ${JSON.stringify({ type: 'content', text: 'Noch keine KI verbunden. Richte unter „Verbindungen → Lokale Modelle" deinen Endpoint ein.' })}\n\n`));
				c.enqueue(enc.encode(`data: ${JSON.stringify({ type: 'done', demo: true })}\n\n`));
				c.close();
			}
		});
		return new Response(stream, { headers: sseHeaders() });
	}

	const headers: Record<string, string> = { 'content-type': 'application/json' };
	if (target.apiKey) headers['authorization'] = 'Bearer ' + target.apiKey;

	const started = Date.now();
	const upstream = await fetch(`${target.base}/v1/chat/completions`, {
		method: 'POST',
		headers,
		body: JSON.stringify({ model: target.model, messages, max_tokens: 4096, temperature: 0.7, stream: true })
	}).catch(() => null);

	if (!upstream || !upstream.ok || !upstream.body) {
		const stream = new ReadableStream({
			start(c) {
				c.enqueue(enc.encode(`data: ${JSON.stringify({ type: 'error', text: 'Modell nicht erreichbar.' })}\n\n`));
				c.close();
			}
		});
		return new Response(stream, { headers: sseHeaders() });
	}

	const reader = upstream.body.getReader();
	const dec = new TextDecoder();
	let buf = '';

	const stream = new ReadableStream({
		async start(controller) {
			const send = (o: unknown) => controller.enqueue(enc.encode(`data: ${JSON.stringify(o)}\n\n`));
			try {
				for (;;) {
					const { done, value } = await reader.read();
					if (done) break;
					buf += dec.decode(value, { stream: true });
					const lines = buf.split('\n');
					buf = lines.pop() ?? '';
					for (const line of lines) {
						const t = line.trim();
						if (!t.startsWith('data:')) continue;
						const payload = t.slice(5).trim();
						if (!payload || payload === '[DONE]') continue;
						try {
							const d = JSON.parse(payload);
							const delta = d?.choices?.[0]?.delta ?? {};
							if (delta.reasoning) send({ type: 'reasoning', text: delta.reasoning });
							if (delta.reasoning_content) send({ type: 'reasoning', text: delta.reasoning_content });
							if (delta.content) send({ type: 'content', text: delta.content });
						} catch { /* unvollständiges JSON ignorieren */ }
					}
				}
				send({ type: 'done', model: target.model, ms: Date.now() - started });
			} catch {
				send({ type: 'error', text: 'Stream abgebrochen.' });
			} finally {
				controller.close();
			}
		},
		cancel() {
			reader.cancel().catch(() => {});
		}
	});

	return new Response(stream, { headers: sseHeaders() });
}

function sseHeaders(): Record<string, string> {
	return {
		'content-type': 'text/event-stream',
		'cache-control': 'no-cache',
		connection: 'keep-alive'
	};
}
