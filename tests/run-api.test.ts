import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { RuntimeStore } from '../src/lib/server/runtime/store';
import { encrypt, decrypt } from '../src/lib/server/crypto';
let store: RuntimeStore;
vi.mock('../src/lib/server/runtime', () => ({ runtimeStore: () => store }));
vi.mock('../src/lib/server/companies', () => ({ getActiveId: () => 'company-a' }));
vi.mock('../src/lib/server/tools', () => ({ resolveToolCall: vi.fn() }));
import { GET, POST } from '../src/routes/api/runs/[id]/+server';

beforeEach(() => { store = new RuntimeStore(':memory:', { encrypt, decrypt }); });
afterEach(() => store.close());
function event(id: string, user: string | null, body: unknown = {}) {
	return { params: { id }, locals: { user: user ? { name: user, method: 'password' } : null },
		request: new Request('http://localhost/api/runs/' + id, { method: 'POST', body: JSON.stringify(body) }) } as unknown as Parameters<typeof GET>[0];
}
it('rejects anonymous access', () => { expect(() => GET(event('anything', null))).toThrow(expect.objectContaining({ status: 401 })); });
it('hides other owners and companies behind 404', () => {
	for (const input of [{ owner: 'bob', companyId: 'company-a' }, { owner: 'alice', companyId: 'company-b' }]) {
		const run = store.create({ ...input, title: 'private' });
		expect(() => GET(event(run.id, 'alice'))).toThrow(expect.objectContaining({ status: 404 }));
	}
});
it('returns only authorized run detail and audit', async () => {
	const run = store.create({ owner: 'alice', companyId: 'company-a', title: 'mine' });
	const response = await GET(event(run.id, 'alice')); expect((await response.json()).run.id).toBe(run.id);
});
it('blocks approval of a call that belongs to another run', async () => {
	const a = store.create({ owner: 'alice', companyId: 'company-a', title: 'mine' });
	const b = store.create({ owner: 'alice', companyId: 'company-a', title: 'other' });
	store.transition(b.id, 'running', 'alice');
	const call = store.prepare({ runId: b.id, name: 'x', args: {}, risk: 'external', reason: 'test', fingerprint: 'v1' }, true);
	await expect(POST(event(a.id, 'alice', { action: 'approve', callId: call.id }))).rejects.toMatchObject({ status: 404 });
});
