import { error, json } from '@sveltejs/kit';
import { decideSetup, generateSetup, setupContext, setupStore } from '$lib/server/ai-setup';
import { sameOrigin, setupBody } from '$lib/server/setup-http';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ locals }) => {
	if (!locals.user) error(401);
	const context = setupContext();
	return json({ context, plans: setupStore().list(locals.user.name, context.companyId),
		audit: setupStore().audit(locals.user.name, context.companyId) }, { headers: { 'cache-control': 'no-store' } });
};
export const POST: RequestHandler = async ({ locals, request, url }) => {
	if (!locals.user) error(401);
	sameOrigin(request, url);
	const body = await setupBody(request);
	if (body.action === 'propose') return json(await generateSetup(locals.user.name, body), { headers: { 'cache-control': 'no-store' } });
	if (['approve', 'reject'].includes(String(body.action)) && typeof body.id === 'string') {
		return json(decideSetup(locals.user.name, body.id, body.action === 'approve'));
	}
	error(400, 'Unbekannte Aktion / unknown action.');
};
