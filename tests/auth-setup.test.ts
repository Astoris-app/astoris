import { beforeEach, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ configured: false, set: vi.fn(), token: ['isolated', 'setup', 'fixture'].join('-') }));
vi.mock('$env/dynamic/private', () => ({ env: { get ASTORIS_SETUP_TOKEN() { return state.token; } } }));
vi.mock('../src/lib/server/auth', () => ({
	hasPassword: () => false, getUsername: () => null, setCredentials: state.set,
	verifyCredentials: () => false, allowTailscaleUser: vi.fn(), isTailscaleAllowed: () => false,
	tailscaleWhois: async () => null, authConfigured: () => state.configured,
	createSession: () => 'test-session', deleteSession: vi.fn(), loginAllowed: () => ({ allowed: true }),
	recordFailure: vi.fn(), clearFailures: vi.fn(), deleteUserSessions: vi.fn()
}));
import { POST } from '../src/routes/api/auth/+server';
beforeEach(() => { state.configured = false; state.set.mockClear(); });
async function setup(setupToken?: string, address = '203.0.113.10') {
	return POST({ request: new Request('https://example.org/api/auth', { method: 'POST',
		headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'set-password',
			username: 'test-operator', password: ['valid', 'test', 'password'].join('-'), setupToken }) }),
		cookies: { set: vi.fn() }, url: new URL('https://example.org/api/auth'), getClientAddress: () => address, locals: {}
	} as unknown as Parameters<typeof POST>[0]);
}
it('continues rejecting an unrecognized remote first setup without the matching operator token', async () => {
	expect((await setup()).status).toBe(403);
	expect((await setup('wrong')).status).toBe(403);
	expect(state.set).not.toHaveBeenCalled();
});
it('accepts the explicit setup token through the existing API, but never overwrites an existing login', async () => {
	expect((await setup(state.token)).status).toBe(200);
	expect(state.set).toHaveBeenCalledTimes(1);
	state.configured = true;
	expect((await setup(state.token)).status).toBe(400);
	expect(state.set).toHaveBeenCalledTimes(1);
});
