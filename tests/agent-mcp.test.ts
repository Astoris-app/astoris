import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { RuntimeStore } from '../src/lib/server/runtime/store';
import { DocumentStore } from '../src/lib/server/runtime/documents';
import { SetupStore } from '../src/lib/server/setup-store';
import { companyContext, operator } from '../src/lib/server/runtime/context';
import { encrypt, decrypt } from '../src/lib/server/crypto';
import { validateSetupPlan } from '../src/lib/setup-plan';

let runtime: RuntimeStore, store: SetupStore;
const model = vi.hoisted(() => vi.fn(async () => ({ runId: 'controlled-run', reply: 'proposal only' })));
vi.mock('../src/lib/server/runtime', () => ({ runtimeStore: () => runtime }));
vi.mock('../src/lib/server/companies', () => ({ listCompanies: () => [{ id: 'company-a' }, { id: 'company-b' }] }));
vi.mock('../src/lib/server/engine', () => ({ engineChat: model }));
vi.mock('../src/lib/server/auth', () => ({ getUsername: () => 'alice', isTailscaleAllowed: () => false }));
vi.mock('../src/lib/server/ai-setup', () => ({ setupStore: () => store,
	setupContext: () => ({ companyId: companyContext.getStore(), owner: operator.getStore(), baseVersion: 1 }),
	proposeSetup: (owner: string, version: number, plan: unknown) => store.create(owner, companyContext.getStore()!, version, validateSetupPlan(plan, ['email']))
}));
import { handleAgentMcp } from '../src/lib/server/agent-mcp';
const clients: Client[] = [];
beforeEach(() => {
	runtime = new RuntimeStore(':memory:', { encrypt, decrypt });
	new DocumentStore(runtime.db, { encrypt, decrypt }).read('companies/company-a/company.json', () => ({ name: 'Original', roles: [], agents: [], goals: [] }));
	store = new SetupStore(runtime.db, { encrypt, decrypt }); model.mockClear();
});
afterEach(async () => { for (const c of clients.splice(0)) await c.close(); runtime.close(); });
async function client(credential: string) {
	const c = new Client({ name: 'codex-like-test-client', version: '1.0.0' }); clients.push(c);
	await c.connect(new StreamableHTTPClientTransport(new URL('https://astoris.example/api/agent/mcp'), {
		requestInit: { headers: { authorization: 'Bearer ' + credential } },
		fetch: async (input, init) => { const request = new Request(input, init); return handleAgentMcp(request, new URL(request.url)); }
	}));
	return c;
}
it('requires a valid bearer credential even without a browser session', async () => {
	const request = new Request('https://astoris.example/api/agent/mcp', { method: 'POST' });
	expect((await handleAgentMcp(request, new URL(request.url))).status).toBe(401);
});
it('supports a real SDK client, exposes only scoped tools, pins company and never exposes approvals', async () => {
	const issued = store.issue('alice', 'company-a', 'Read-only', ['setup:read'], 7);
	const c = await client(issued.credential);
	expect((await c.listTools()).tools.map((t) => t.name)).toEqual(['astoris_setup_context']);
	const result = await c.callTool({ name: 'astoris_setup_context', arguments: {} });
	expect(JSON.parse((result.content as { text: string }[])[0].text)).toMatchObject({ companyId: 'company-a', owner: 'alice' });
	expect((await c.callTool({ name: 'astoris_propose_setup', arguments: {} })).isError).toBe(true);
	expect(store.list('alice', 'company-a')).toEqual([]);
	store.revoke(issued.access.id, 'alice', 'company-a');
	await expect(c.listTools()).rejects.toThrow();
});
it('accepts a proposal but cannot approve it, rejects wrong owners and hides foreign runs', async () => {
	const issued = store.issue('alice', 'company-a', 'Planner', ['setup:read', 'setup:propose', 'runs:read'], 7);
	const c = await client(issued.credential);
	const result = await c.callTool({ name: 'astoris_propose_setup', arguments: { baseVersion: 1, plan: {
		summary: 'Proposed only', profile: { name: 'Proposed', industry: '', mission: '' }, roles: [], goals: [], connectors: ['email']
	} } });
	expect(result.isError).not.toBe(true);
	const draft = store.list('alice', 'company-a')[0]; expect(draft.status).toBe('draft');
	expect((await c.callTool({ name: 'astoris_approve_setup', arguments: { id: draft.id } })).isError).toBe(true);
	const foreign = runtime.create({ owner: 'bob', companyId: 'company-a', title: 'private' });
	expect((await c.callTool({ name: 'astoris_get_run', arguments: { id: foreign.id } })).isError).toBe(true);
	expect((await c.callTool({ name: 'astoris_send_message', arguments: { message: 'not granted' } })).isError).toBe(true);
	expect(model).not.toHaveBeenCalled();
});
it('starts model tasks only with a granted scope and fixed autonomy 1', async () => {
	const issued = store.issue('alice', 'company-a', 'Tasks', ['runs:create'], 7);
	const c = await client(issued.credential);
	await c.callTool({ name: 'astoris_send_message', arguments: { message: 'Prepare a task' } });
	expect(model).toHaveBeenCalledWith([{ role: 'user', content: 'Prepare a task' }], null, undefined, { autonomy: 1 });
});
