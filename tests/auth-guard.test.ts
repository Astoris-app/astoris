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
function request(path: string) {
	return handle({ event: { url: new URL('https://example.org' + path), cookies: { get: () => undefined }, locals: {}, getClientAddress: () => '127.0.0.1' },
		resolve: async () => Response.json({ owner: operator.getStore(), company: companyContext.getStore() }) } as unknown as Parameters<typeof handle>[0]);
}
it.each(['/api/plugins', '/api/company', '/api/mail', '/api/runs', '/api/runs/example'])('protects %s even before setup', async (path) => {
	expect((await request(path)).status).toBe(401);
});
it('permits onboarding-only endpoints before configuration, but protects them afterwards', async () => {
	expect((await request('/api/connections')).status).toBe(200);
	auth.configured = true;
	expect((await request('/api/connections')).status).toBe(401);
});
it('pins the authenticated owner and company for handlers', async () => {
	auth.configured = true; auth.setup = true; auth.session = { user: 'alice', method: 'password' };
	expect(await (await request('/api/runs')).json()).toEqual({ owner: 'alice', company: 'company-a' });
});
