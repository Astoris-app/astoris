import { json, error } from '@sveltejs/kit';
import { engineComplete, type ChatMsg } from '$lib/server/engine';
import { availableModels, type SelectedModel } from '$lib/server/models';

// Modell-Vergleich. Auth global über hooks.server.ts (/api ohne Session → 401).
// POST {query, models[]}          → SSE: pro Modell parallel eine Antwort, sobald fertig
// POST {action:'synthesize', …}   → JSON: KI-Bewertung der Antworten (blind: nur Positionen A/B/C)

type ModelPick = { source: 'local' | 'cloud'; model: string; label: string };

function sanitizeModels(raw: unknown): ModelPick[] {
	if (!Array.isArray(raw)) return [];
	// Nur tatsächlich verfügbare Modelle zulassen — kein beliebiger, vom Client erzwungener Modell-String (Cost/Injection).
	const allowed = new Set(availableModels().map((m) => `${m.source}:${m.model}`));
	return raw
		.filter((m) => m && (m.source === 'local' || m.source === 'cloud'))
		.map((m) => ({ source: m.source as 'local' | 'cloud', model: String(m.model ?? ''), label: String(m.label ?? m.model ?? m.source).slice(0, 60) }))
		.filter((m) => allowed.has(`${m.source}:${m.model}`))
		.slice(0, 4);
}

// Positionsbuchstaben A, B, C … — für die blinde Bewertung (Judge sieht nie Modellnamen).
const LETTER = (i: number) => String.fromCharCode(65 + i);

export async function POST({ request }) {
	const body = await request.json().catch(() => null);

	// --- Synthese/Bewertung (separater, kurzer Aufruf) ---
	if (body?.action === 'synthesize') {
		const query = (body?.query ?? '').toString().trim().slice(0, 2000);
		// Harte Obergrenzen gegen Token-Explosion (Anzahl + Länge je Antwort).
		const answers: { reply: string }[] = (Array.isArray(body?.answers) ? body.answers : []).slice(0, 4);
		if (!query || answers.length < 2) throw error(400, 'query und mindestens zwei Antworten nötig');
		const block = answers.map((a, i) => `[${LETTER(i)}]\n${String(a.reply ?? '').slice(0, 4000)}`).join('\n\n');
		const r = await engineComplete([
			{ role: 'system', content: 'Du bewertest mehrere KI-Antworten auf dieselbe Frage neutral und knapp. Du kennst die Modellnamen nicht — beziehe dich nur auf die Buchstaben.' },
			{ role: 'user', content: `Frage: ${query}\n\nAntworten:\n\n${block}\n\nVergleiche die Antworten: nenne je Antwort in einem Satz Stärke und Schwäche, dann eine klare Empfehlung, welche am stärksten ist und warum. Antworte auf Deutsch, kompakt.` }
		]);
		if (r.source === 'demo' || !r.reply.trim()) throw error(503, 'Bewertung nicht möglich — KI nicht erreichbar.');
		return json({ synthesis: r.reply.trim(), model: r.model ?? '' });
	}

	// --- Vergleich: N Modelle parallel, Antworten gestreamt ---
	const query = (body?.query ?? '').toString().trim().slice(0, 4000);
	if (!query) throw error(400, 'query fehlt');
	const models = sanitizeModels(body?.models);
	if (models.length < 2) throw error(400, 'Mindestens zwei Modelle wählen.');

	const enc = new TextEncoder();
	const stream = new ReadableStream({
		async start(c) {
			let closed = false;
			const send = (o: unknown) => { if (!closed) c.enqueue(enc.encode(`data: ${JSON.stringify(o)}\n\n`)); };
			const msgs: ChatMsg[] = [{ role: 'user', content: query }];
			// Alle Modelle gleichzeitig starten; jede Antwort wird gesendet, sobald sie fertig ist.
			await Promise.all(models.map(async (m, i) => {
				const t0 = Date.now();
				const override: SelectedModel = { source: m.source, model: m.model };
				try {
					const r = await engineComplete(msgs, override);
					if (r.source === 'demo') send({ type: 'error', index: i, label: m.label, message: r.reply });
					else send({ type: 'answer', index: i, label: m.label, model: r.model ?? m.model, reply: r.reply, ms: Date.now() - t0 });
				} catch (e) {
					send({ type: 'error', index: i, label: m.label, message: e instanceof Error ? e.message : 'Fehler' });
				}
			}));
			send({ type: 'done' });
			closed = true;
			try { c.close(); } catch { /* bereits geschlossen */ }
		}
	});

	return new Response(stream, {
		headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' }
	});
}
