import { json, error } from '@sveltejs/kit';
import { CONNECTORS } from '$lib/connectors';
import { listPublic, upsert, remove } from '$lib/server/store';
import { testConnection } from '$lib/server/connector-tests';

export async function GET() {
	return json({ connections: listPublic() });
}

export async function POST({ request }) {
	const body = await request.json().catch(() => null);
	const connectorId = body?.connectorId?.toString();
	const def = CONNECTORS.find((c) => c.id === connectorId);
	if (!def) throw error(400, 'Unbekannte Verbindung.');

	const fields: Record<string, string> = {};
	for (const fld of def.fields) {
		const v = (body?.fields?.[fld.key] ?? '').toString().trim();
		if (!v && !fld.optional) throw error(400, `Feld "${fld.label}" ist erforderlich.`);
		if (v) fields[fld.key] = v;
	}

	const scopes: Record<string, boolean> = {};
	for (const s of def.scopes) scopes[s.id] = Boolean(body?.scopes?.[s.id] ?? s.default);

	// Immer zuerst live testen.
	const result = await testConnection(connectorId, fields);
	const testOnly = Boolean(body?.testOnly);

	if (testOnly) return json({ result });

	// Nur speichern, wenn der Test bestanden (oder bewusst übersprungen) wurde.
	if (!result.ok) return json({ result, saved: false });

	const connection = upsert({
		connectorId,
		fields,
		scopes,
		status: result.skipped ? 'untested' : 'ok',
		lastTest: new Date().toISOString()
	});
	return json({ result, saved: true, connection });
}

export async function DELETE({ url }) {
	const id = url.searchParams.get('id');
	if (!id) throw error(400, 'id fehlt.');
	remove(id);
	return json({ ok: true });
}
