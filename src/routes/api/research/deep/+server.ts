import { error } from '@sveltejs/kit';
import { runDeepResearch, type DeepDepth } from '$lib/server/research/pipeline';
import { saveReport, type ReportSource } from '$lib/server/research-reports';
import { upsertSearch } from '$lib/server/research-history';
import type { SelectedModel } from '$lib/server/models';

// Deep Research als Server-Sent-Events: jeder Pipeline-Schritt wird live an den Client gestreamt.
// Auth läuft global über hooks.server.ts (wie alle /api-Routen). Abbruch: request.signal.
const DEPTHS: DeepDepth[] = ['schnell', 'ausgewogen', 'gruendlich'];

export async function POST({ request }) {
	const body = await request.json().catch(() => null);
	const query = (body?.query ?? '').toString().trim();
	if (!query) throw error(400, 'query fehlt');
	const depth: DeepDepth = DEPTHS.includes(body?.depth) ? body.depth : 'ausgewogen';
	// Override nur für den Cloud-Fall übernehmen ("auf Claude umschalten"); sonst lokal (default).
	const ov = body?.override;
	const override: SelectedModel | null =
		ov && ov.source === 'cloud' ? { source: 'cloud', model: String(ov.model || '') } : null;

	const enc = new TextEncoder();
	const signal = request.signal;

	const stream = new ReadableStream({
		async start(c) {
			let closed = false;
			const send = (o: unknown) => { if (!closed) c.enqueue(enc.encode(`data: ${JSON.stringify(o)}\n\n`)); };
			try {
				let markdown = '';
				let sources: ReportSource[] = [];
				let model = '';
				let usedDepth: DeepDepth = depth;
				for await (const ev of runDeepResearch(query, { depth, override, signal })) {
					send(ev);
					if (ev.type === 'report') { markdown = ev.markdown; sources = ev.sources; model = ev.model; usedDepth = ev.depth; }
				}
				// Nur speichern, wenn ein echter Bericht entstand und der Client nicht abgebrochen hat.
				if (markdown && !signal.aborted) {
					const report = saveReport({ query, markdown, sources, model, depth: usedDepth });
					try { upsertSearch({ query }); } catch { /* Historie best-effort */ }
					send({ type: 'saved', id: report.id });
				}
				send({ type: 'done' });
			} catch (e) {
				send({ type: 'error', message: e instanceof Error ? e.message : 'Recherche fehlgeschlagen' });
			} finally {
				closed = true;
				try { c.close(); } catch { /* bereits geschlossen */ }
			}
		}
	});

	return new Response(stream, {
		headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' }
	});
}
