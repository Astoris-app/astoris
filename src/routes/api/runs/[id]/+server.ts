import { json, error } from '@sveltejs/kit';
import { runtimeStore } from '$lib/server/runtime';
import { getActiveId } from '$lib/server/companies';
import { resolveToolCall } from '$lib/server/tools';
import type { RequestEvent } from '@sveltejs/kit';

function scopedRun(event: RequestEvent) {
	if (!event.locals.user) throw error(401, 'Nicht angemeldet.');
	const run = runtimeStore().get(event.params.id ?? '');
	if (!run || run.owner !== event.locals.user.name || run.companyId !== getActiveId()) throw error(404, 'Lauf nicht gefunden.');
	return run;
}

export function GET(event) {
	const run = scopedRun(event);
	return json({ run, calls: runtimeStore().calls(run.id), events: runtimeStore().events(run.id) });
}

export async function POST(event) {
	const run = scopedRun(event);
	const body = await event.request.json().catch(() => null);
	const actor = event.locals.user!.name;
	try {
		if (body?.action === 'cancel') {
			if (runtimeStore().calls(run.id).some((c) => c.status === 'running')) throw error(409, 'Eine Aktion wird bereits ausgeführt. Bitte Ergebnis abwarten.');
			return json({ run: runtimeStore().transition(run.id, 'cancelled', actor) });
		}
		if (body?.action !== 'approve' && body?.action !== 'reject') throw error(400, 'Unbekannte Aktion.');
		const call = typeof body.callId === 'string' ? runtimeStore().call(body.callId) : null;
		if (!call || call.runId !== run.id) throw error(404, 'Werkzeugaufruf nicht gefunden.');
		const result = await resolveToolCall(call.id, body.action === 'approve', actor);
		return json({ call: result, run: runtimeStore().get(run.id) });
	} catch (e) {
		if (e && typeof e === 'object' && 'status' in e) throw e;
		throw error(409, 'Aktion konnte nicht übernommen werden. Bitte Laufprotokoll aktualisieren.');
	}
}
