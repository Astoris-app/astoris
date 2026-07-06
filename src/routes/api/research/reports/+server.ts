import { json, error } from '@sveltejs/kit';
import { listReports, getReport, removeReport } from '$lib/server/research-reports';

// Gespeicherte Deep-Research-Berichte. Auth global über hooks.server.ts (/api ohne Session → 401).
// GET            → Liste (nur Metadaten, ohne markdown/Quellen — schlanke Payload für die Übersicht)
// GET ?id=<id>   → vollständiger Bericht (markdown + Quellen)
export async function GET({ url }) {
	const id = url.searchParams.get('id');
	if (id) {
		const report = getReport(id);
		if (!report) throw error(404, 'Bericht nicht gefunden');
		return json({ report });
	}
	const reports = listReports().map((r) => ({
		id: r.id,
		query: r.query,
		at: r.at,
		model: r.model,
		depth: r.depth,
		sourceCount: r.sources.length
	}));
	return json({ reports });
}

// POST { action: 'delete', id } → Bericht löschen.
export async function POST({ request }) {
	const body = await request.json().catch(() => null);
	if (body?.action === 'delete' && body.id) {
		return json({ ok: removeReport(String(body.id)) });
	}
	throw error(400, 'Unbekannte Aktion');
}
