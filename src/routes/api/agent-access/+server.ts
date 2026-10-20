import { error, json } from '@sveltejs/kit';
import { setupContext, setupStore } from '$lib/server/ai-setup';
import { sameOrigin, setupBody } from '$lib/server/setup-http';
import type { AgentScope } from '$lib/setup-plan';
import type { RequestHandler } from './$types';
export const GET: RequestHandler = ({ locals }) => {
	if (!locals.user) error(401);
	return json({ accesses: setupStore().accessList(locals.user.name, setupContext().companyId) }, { headers: { 'cache-control': 'no-store' } });
};
export const POST: RequestHandler = async ({ locals, request, url }) => {
	if (!locals.user) error(401);
	sameOrigin(request, url);
	const body = await setupBody(request);
	const company = setupContext().companyId;
	if (body.action === 'revoke' && typeof body.id === 'string') {
		setupStore().revoke(body.id, locals.user.name, company); return json({ ok: true });
	}
	if (body.action === 'create' && typeof body.name === 'string' && Array.isArray(body.scopes)) {
		setupStore().limit('issue:' + locals.user.name);
		return json(setupStore().issue(locals.user.name, company, body.name, body.scopes as AgentScope[], Number(body.days), locals.user.method === 'tailscale' ? 'tailscale' : 'password'),
			{ headers: { 'cache-control': 'no-store' } });
	}
	error(400);
};
