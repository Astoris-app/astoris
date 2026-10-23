import { beforeEach, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({ configured: false, setup: false, session: null as null | { user: string; method: string } }));
vi.mock('../src/lib/server/setup', () => ({ isSetupDone: () => auth.setup }));
vi.mock('../src/lib/server/auth', () => ({
	getSession: () => auth.session, authConfigured: () => auth.configured, tailscaleWhois: async () => null,
	isTailscaleAllowed: () => false, createSession: vi.fn()
}));
vi.mock('../src/lib/server/companies', () => ({ getActiveId: () => 'company-a' }));
import { handle } from '../src/hooks.server';
import { companyContext, operator } from '../src/lib/server/runtime/context';

beforeEach(() => { auth.configured = false; auth.setup = false; auth.session = null; });
function request(path: string, method = 'GET') {
	return handle({ event: { url: new URL('https://example.org' + path), request: new Request('https://example.org' + path, { method }), cookies: { get: () => undefined }, locals: {}, getClientAddress: () => '127.0.0.1' },
		resolve: async () => Response.json({ owner: operator.getStore(), company: companyContext.getStore() }) } as unknown as Parameters<typeof handle>[0]);
}
it.each(['/api/plugins', '/api/company', '/api/mail', '/api/runs', '/api/runs/example', '/api/ai-setup', '/api/agent-access', '/api/agent/mcp/other'])('protects %s even before setup', async (path) => {
	expect((await request(path)).status).toBe(401);
});
it('requires a session for account configuration and setup completion, even before first login', async () => {
	for (const path of ['/api/connections', '/api/engine', '/api/setup']) expect((await request(path, 'POST')).status).toBe(401);
	expect((await request('/api/connections')).status).toBe(401);
	expect((await request('/api/setup')).status).toBe(200);
	expect((await request('/api/auth')).status).toBe(200);
	auth.configured = true;
	expect((await request('/api/connections')).status).toBe(401);
});
it('exposes login before setup and sends anonymous welcome visitors to login', async () => {
	expect((await request('/login')).status).toBe(200);
	await expect(request('/welcome')).rejects.toMatchObject({ status: 303, location: '/login' });
	await expect(request('/')).rejects.toMatchObject({ status: 303, location: '/login' });
});
it('lets the authenticated operator configure the company before finishing the tour', async () => {
	auth.configured = true; auth.session = { user: 'alice', method: 'password' };
	expect((await request('/welcome')).status).toBe(200);
	expect((await request('/api/companies', 'POST')).status).toBe(200);
	await expect(request('/')).rejects.toMatchObject({ status: 303, location: '/welcome' });
});
it('pins the authenticated owner and company for handlers', async () => {
	auth.configured = true; auth.setup = true; auth.session = { user: 'alice', method: 'password' };
	expect(await (await request('/api/runs')).json()).toEqual({ owner: 'alice', company: 'company-a' });
});
it('never elevates an agent bearer credential through a browser or Tailscale session', async () => {
	auth.configured = true; auth.setup = true; auth.session = { user: 'alice', method: 'password' };
	const response = await handle({ event: {
		url: new URL('https://example.org/api/agent-access'),
		request: new Request('https://example.org/api/agent-access', { headers: { authorization: 'Bearer ' + 'astoris_' + 'x'.repeat(43) } }),
		cookies: { get: () => 'existing-session' }, locals: {}, getClientAddress: () => '127.0.0.1'
	}, resolve: async () => Response.json({ privileged: true }) } as unknown as Parameters<typeof handle>[0]);
	expect(response.status).toBe(401);
});
