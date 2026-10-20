import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { RuntimeStore } from '../src/lib/server/runtime/store';
import { DocumentStore } from '../src/lib/server/runtime/documents';
import { SetupStore } from '../src/lib/server/setup-store';
import { validateSetupPlan, type SetupPlan } from '../src/lib/setup-plan';
import { encrypt, decrypt } from '../src/lib/server/crypto';

let runtime: RuntimeStore, documents: DocumentStore, store: SetupStore;
const key = 'companies/company-a/company.json';
const plan: SetupPlan = { summary: 'Consulting setup', profile: { name: 'New name', industry: 'Consulting', mission: 'Private mission' },
	roles: [{ title: 'Support', description: 'Help customers' }], goals: [{ title: 'First customer', description: 'One onboarding completed' }], connectors: ['email'] };
beforeEach(() => {
	runtime = new RuntimeStore(':memory:', { encrypt, decrypt }); documents = new DocumentStore(runtime.db, { encrypt, decrypt });
	store = new SetupStore(runtime.db, { encrypt, decrypt });
	documents.read(key, () => ({ name: 'Old name', industry: '', mission: '', roles: [], agents: [], goals: [], knowledge: 'Keep existing knowledge', custom: 42 }));
});
afterEach(() => { vi.useRealTimers(); runtime.close(); });
it('validates a narrow schema and rejects credentials/code/unknown connections/duplicates', () => {
	expect(validateSetupPlan(plan, ['email'])).toEqual(plan);
	for (const bad of [{ ...plan, code: 'not allowed' }, { ...plan, profile: { ...plan.profile, secret: 'not allowed' } },
		{ ...plan, connectors: ['unknown'] }, { ...plan, roles: [plan.roles[0], plan.roles[0]] }, { ...plan, goals: Array(7).fill(plan.goals[0]) }]) {
		expect(() => validateSetupPlan(bad, ['email'])).toThrow();
	}
});
it('proposes without effects, preserves old fields, applies once with no new tool permissions', () => {
	const draft = store.create('alice', 'company-a', 1, plan);
	expect(documents.read(key, () => null).value).toHaveProperty('name', 'Old name');
	expect(store.decide(draft.id, 'alice', 'company-a', true).status).toBe('applied');
	store.decide(draft.id, 'alice', 'company-a', true);
	const value = documents.read<Record<string, any>>(key, () => ({})).value;
	expect(value).toMatchObject({ name: 'New name', knowledge: 'Keep existing knowledge', custom: 42 });
	expect(value.roles).toHaveLength(1); expect(value.goals).toHaveLength(1);
	expect(value.agents[0]).toMatchObject({ autonomyLevel: 1, tools: [] });
	expect(store.audit('alice', 'company-a').filter((e) => e.action === 'setup.applied')).toHaveLength(1);
	const raw = JSON.stringify(runtime.db.prepare('SELECT payload FROM setup_plans').all());
	expect(raw).not.toContain('Private mission'); expect(raw).not.toContain('Keep existing knowledge');
});
it('rejects stale proposals and stale approvals instead of overwriting another change', () => {
	const draft = store.create('alice', 'company-a', 1, plan);
	documents.write(key, { name: 'Concurrent edit' }, 1);
	expect(() => store.create('alice', 'company-a', 1, plan)).toThrow(expect.objectContaining({ status: 409 }));
	expect(() => store.decide(draft.id, 'alice', 'company-a', true)).toThrow(expect.objectContaining({ status: 409 }));
	expect(store.get(draft.id, 'alice', 'company-a').status).toBe('draft');
});
it('hides plans from other owners and companies', () => {
	const draft = store.create('alice', 'company-a', 1, plan);
	for (const [owner, company] of [['bob', 'company-a'], ['alice', 'company-b']]) {
		expect(() => store.decide(draft.id, owner, company, true)).toThrow(expect.objectContaining({ status: 404 }));
	}
});
it('rolls back company and audit if the plan commit fails', () => {
	const draft = store.create('alice', 'company-a', 1, plan);
	runtime.db.exec("CREATE TRIGGER fail_apply BEFORE UPDATE ON setup_plans BEGIN SELECT RAISE(ABORT, 'test'); END");
	expect(() => store.decide(draft.id, 'alice', 'company-a', true)).toThrow();
	expect(documents.read(key, () => null).value).toHaveProperty('name', 'Old name');
	expect(store.audit('alice', 'company-a')).toHaveLength(1);
});
it('does not allow rejected or expired plans to be applied', () => {
	const a = store.create('alice', 'company-a', 1, plan); store.decide(a.id, 'alice', 'company-a', false);
	expect(() => store.decide(a.id, 'alice', 'company-a', true)).toThrow();
	const b = store.create('alice', 'company-a', 1, plan);
	vi.useFakeTimers(); vi.setSystemTime(Date.now() + 86400001);
	expect(() => store.decide(b.id, 'alice', 'company-a', true)).toThrow();
});
it('stores only hashed access credentials and enforces expiry, revocation and scope allowlists', () => {
	const issued = store.issue('alice', 'company-a', 'Test agent', ['setup:read'], 1);
	expect(store.authenticate(issued.credential)).toMatchObject({ owner: 'alice', companyId: 'company-a', scopes: ['setup:read'] });
	expect(JSON.stringify(runtime.db.prepare('SELECT * FROM agent_access').all())).not.toContain(issued.credential);
	expect(JSON.stringify(store.accessList('alice', 'company-a'))).not.toContain(issued.credential);
	expect(() => store.issue('alice', 'company-a', 'Bad', ['approve' as never], 7)).toThrow();
	expect(() => store.issue('alice', 'company-a', 'Bad', ['setup:read'], 31)).toThrow();
	expect(() => store.revoke(issued.access.id, 'bob', 'company-a')).toThrow();
	store.revoke(issued.access.id, 'alice', 'company-a');
	expect(() => store.authenticate(issued.credential)).toThrow(expect.objectContaining({ status: 401 }));
	const expiring = store.issue('alice', 'company-a', 'Expiring', ['setup:read'], 1);
	vi.useFakeTimers(); vi.setSystemTime(Date.now() + 86400001);
	expect(() => store.authenticate(expiring.credential)).toThrow(expect.objectContaining({ status: 401 }));
});
it('persists rate limits across store instances', () => {
	store.limit('generate:alice', 1);
	const next = new SetupStore(runtime.db, { encrypt, decrypt });
	expect(() => next.limit('generate:alice', 1)).toThrow(expect.objectContaining({ status: 429 }));
});
