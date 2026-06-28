import { error } from '@sveltejs/kit';
import { engineChat, type ChatMsg } from '$lib/server/engine';
import { getSendMode } from '$lib/server/sendMode';

// Streamt die Antwort als SSE. Die KI hat immer Werkzeuge (Kalender + aktive Add-ons),
// daher läuft alles über engineChat (Tool-Calling-Loop) inkl. aigate-Schutz und Fallback.
export async function POST({ request }) {
	const body = await request.json().catch(() => null);
	let messages: ChatMsg[] = Array.isArray(body?.messages) ? body.messages : [];
	messages = messages.filter((m) => m && typeof m.content === 'string' && m.content.trim()).slice(-20);
	if (!messages.length) throw error(400, 'message fehlt');

	const enc = new TextEncoder();
	const t0 = Date.now();
	const result = await engineChat(messages);
	// Sicherheit: Wurde in derselben Antwort fremder Web-Inhalt geladen (url-reader/web-search/http-request),
	// NIE automatisch senden — auf Bestätigung zwingen (Prompt-Injection-Schutz).
	const webTools = new Set(['url-reader', 'web-search', 'http-request']);
	const usedWebTool = (result.tools ?? []).some((t) => webTools.has(t));
	const sendMode = usedWebTool ? 'confirm' : getSendMode();
	const stream = new ReadableStream({
		start(c) {
			if (result.tools?.length) c.enqueue(enc.encode(`data: ${JSON.stringify({ type: 'tools', names: result.tools })}\n\n`));
			c.enqueue(enc.encode(`data: ${JSON.stringify({ type: 'content', text: result.reply })}\n\n`));
			if (result.pendingMail) c.enqueue(enc.encode(`data: ${JSON.stringify({ type: 'pending-mail', draft: result.pendingMail, mode: sendMode })}\n\n`));
			if (result.pendingMessage) c.enqueue(enc.encode(`data: ${JSON.stringify({ type: 'pending-message', draft: result.pendingMessage, mode: sendMode })}\n\n`));
			// Add-on-Vorschlag: IMMER als Karte zur Bestätigung (Code wird nie automatisch installiert).
			if (result.pendingAddon) c.enqueue(enc.encode(`data: ${JSON.stringify({ type: 'pending-addon', addon: result.pendingAddon })}\n\n`));
			c.enqueue(enc.encode(`data: ${JSON.stringify({ type: 'done', model: result.model, tools: result.tools, demo: result.source === 'demo', ms: Date.now() - t0 })}\n\n`));
			c.close();
		}
	});
	return new Response(stream, { headers: sseHeaders() });
}

function sseHeaders(): Record<string, string> {
	return { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' };
}
