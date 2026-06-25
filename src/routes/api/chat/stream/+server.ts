import { error } from '@sveltejs/kit';
import { engineChat, type ChatMsg } from '$lib/server/engine';

// Streamt die Antwort als SSE. Die KI hat immer Werkzeuge (Kalender + aktive Add-ons),
// daher läuft alles über engineChat (Tool-Calling-Loop) inkl. aigate-Schutz und Fallback.
export async function POST({ request }) {
	const body = await request.json().catch(() => null);
	let messages: ChatMsg[] = Array.isArray(body?.messages) ? body.messages : [];
	messages = messages.filter((m) => m && typeof m.content === 'string' && m.content.trim()).slice(-20);
	if (!messages.length) throw error(400, 'message fehlt');

	const enc = new TextEncoder();
	const result = await engineChat(messages);
	const stream = new ReadableStream({
		start(c) {
			if (result.tools?.length) c.enqueue(enc.encode(`data: ${JSON.stringify({ type: 'tools', names: result.tools })}\n\n`));
			c.enqueue(enc.encode(`data: ${JSON.stringify({ type: 'content', text: result.reply })}\n\n`));
			c.enqueue(enc.encode(`data: ${JSON.stringify({ type: 'done', model: result.model, tools: result.tools, demo: result.source === 'demo' })}\n\n`));
			c.close();
		}
	});
	return new Response(stream, { headers: sseHeaders() });
}

function sseHeaders(): Record<string, string> {
	return { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' };
}
