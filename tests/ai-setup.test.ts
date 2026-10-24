import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { RuntimeStore } from '../src/lib/server/runtime/store';
import { DocumentStore } from '../src/lib/server/runtime/documents';
import { encrypt, decrypt } from '../src/lib/server/crypto';
import { companyContext } from '../src/lib/server/runtime/context';
const model = vi.hoisted(() => vi.fn());
let runtime: RuntimeStore;
vi.mock('../src/lib/server/runtime', () => ({ runtimeStore: () => runtime }));
vi.mock('../src/lib/server/engine', () => ({ engineChat: model }));
vi.mock('../src/lib/server/companies', () => ({ getActiveId: () => companyContext.getStore() ?? 'company-a',
	listCompanies: () => [{ id: 'company-a' }], renameCompany: vi.fn() }));
vi.mock('../src/lib/server/company', () => ({ getCompany: () => ({ name: 'Existing', industry: '', mission: '', roles: [], goals: [] }) }));

beforeEach(() => { vi.resetModules(); runtime = new RuntimeStore(':memory:', { encrypt, decrypt });
	new DocumentStore(runtime.db, { encrypt, decrypt }).read('companies/company-a/company.json', () => ({ name: 'Existing', roles: [], agents: [], goals: [] })); });
afterEach(() => runtime.close());
const plan = { summary: 'New plan', profile: { name: 'Suggested', industry: '', mission: '' }, roles: [], goals: [], connectors: [] };
it('uses no tools for planning and never applies generated data automatically', async () => {
	model.mockResolvedValue({ source: 'model', reply: JSON.stringify({ kind: 'plan', plan }) });
	const { generateSetup, setupStore } = await import('../src/lib/server/ai-setup');
	const result = await generateSetup('alice', { brief: 'A company' });
	expect(result).toMatchObject({ kind: 'plan', draft: { status: 'draft' } });
	expect(model.mock.calls.at(-1)?.slice(1)).toEqual([null, ['__addongen_no_tools__'], { autonomy: 0 }]);
	expect(setupStore().list('alice', 'company-a')).toHaveLength(1);
});
it('returns questions but rejects offline/demo, malformed, over-broad and stale plans', async () => {
	const { generateSetup } = await import('../src/lib/server/ai-setup');
	model.mockResolvedValueOnce({ source: 'model', reply: JSON.stringify({ kind: 'questions', questions: ['What is your goal?'] }) });
	expect(await generateSetup('alice', { brief: 'A company' })).toMatchObject({ kind: 'questions' });
	for (const result of [{ source: 'demo', reply: JSON.stringify({ kind: 'plan', plan }) }, { source: 'model', reply: 'not JSON' },
		{ source: 'model', reply: JSON.stringify({ kind: 'plan', plan: { ...plan, code: 'not permitted' } }) }]) {
		model.mockResolvedValueOnce(result); await expect(generateSetup('alice', { brief: 'A company' })).rejects.toHaveProperty('status');
	}
});
