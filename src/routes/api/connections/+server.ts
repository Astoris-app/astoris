import { json, error } from '@sveltejs/kit';
import { CONNECTORS } from '$lib/connectors';
import { listPublic, upsert, remove, getDecrypted } from '$lib/server/store';
import { testConnection } from '$lib/server/connector-tests';

export async function GET({ url }) {
	const id = url.searchParams.get('id');
	if (id) {
		const conn = getDecrypted(id);
		if (!conn) throw error(404, 'Verbindung nicht gefunden.');
		const def = CONNECTORS.find((c) => c.id === id);
		// Nur Nicht-Passwort-Felder zurückgeben (Secrets bleiben am Server).
		const fields: Record<string, string> = {};
		for (const f of def?.fields ?? []) {
			if (f.type !== 'password' && conn.plain[f.key]) fields[f.key] = conn.plain[f.key];
		}
		return json({ fields, scopes: conn.scopes });
	}
	return json({ connections: listPublic() });
}

export async function POST({ request }) {
	const body = await request.json().catch(() => null);
	const connectorId = body?.connectorId?.toString();
	const def = CONNECTORS.find((c) => c.id === connectorId);
	if (!def) throw error(400, 'Unbekannte Verbindung.');

	const existing = getDecrypted(connectorId);
	const fields: Record<string, string> = {};
	for (const fld of def.fields) {
		let v = (body?.fields?.[fld.key] ?? '').toString().trim();
		// Leeres Feld beim Bearbeiten → gespeicherten Wert behalten (kein Neu-Eingeben).
		if (!v && existing?.plain?.[fld.key]) v = existing.plain[fld.key];
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
