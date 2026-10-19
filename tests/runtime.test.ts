import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RuntimeStore } from '../src/lib/server/runtime/store';
import { encrypt, decrypt } from '../src/lib/server/crypto';

const stores: RuntimeStore[] = [];
const paths: string[] = [];
function database(path = ':memory:') { const store = new RuntimeStore(path, { encrypt, decrypt }); stores.push(store); return store; }
function running(store: RuntimeStore, owner = 'alice', companyId = 'company-a') {
	const run = store.create({ owner, companyId, title: 'private customer context' });
	store.transition(run.id, 'running', owner); return run;
}
function prepare(store: RuntimeStore, runId: string, approval = true) {
	return store.prepare({ runId, name: 'calendar_create', args: { title: 'secret appointment' }, risk: 'write', reason: 'Confirm', fingerprint: 'v1' }, approval);
}
afterEach(() => { for (const store of stores.splice(0)) store.close(); for (const path of paths.splice(0)) rmSync(path, { recursive: true, force: true }); });

describe('durable run state machine', () => {
	it('persists pending approvals across reopening, with encrypted payloads', () => {
		const dir = mkdtempSync(join(tmpdir(), 'astoris-runtime-test-')); paths.push(dir);
		const file = join(dir, 'runtime.sqlite');
		const store = database(file); const run = running(store); const call = prepare(store, run.id);
		store.transition(run.id, 'waiting_for_approval', 'alice');
		store.db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
		expect(readFileSync(file).includes(Buffer.from('secret appointment'))).toBe(false);
		expect(readFileSync(file).includes(Buffer.from('private customer context'))).toBe(false);
		const reopened = database(file); reopened.recover();
		expect(reopened.get(run.id)?.status).toBe('waiting_for_approval');
		expect(reopened.call(call.id)?.args.title).toBe('secret appointment');
	});
	it('prevents duplicate approvals and claims across connections', () => {
		const dir = mkdtempSync(join(tmpdir(), 'astoris-runtime-test-')); paths.push(dir);
		const file = join(dir, 'runtime.sqlite');
		const first = database(file); const second = database(file); const run = running(first); const call = prepare(first, run.id);
		first.transition(run.id, 'waiting_for_approval', 'alice'); first.decide(call.id, true, 'alice');
		expect(() => second.decide(call.id, true, 'alice')).toThrow();
		first.claim(call.id, 'alice'); expect(() => second.claim(call.id, 'alice')).toThrow();
		first.finish(call.id, { ok: true }); first.settle(run.id);
		expect(second.get(run.id)?.status).toBe('completed');
	});
	it('never executes a rejected or cancelled request', () => {
		const store = database(); const run = running(store); const call = prepare(store, run.id);
		store.transition(run.id, 'waiting_for_approval', 'alice'); store.decide(call.id, false, 'alice');
		expect(() => store.claim(call.id, 'alice')).toThrow(); store.settle(run.id);
		expect(store.get(run.id)?.status).toBe('completed');
		const other = running(store); const pending = prepare(store, other.id);
		store.transition(other.id, 'cancelled', 'alice'); expect(store.call(pending.id)?.status).toBe('cancelled');
		expect(() => store.decide(pending.id, true, 'alice')).toThrow();
	});
	it('does not replay uncertain effects after a crash', () => {
		const store = database(); const run = running(store); const call = prepare(store, run.id, false);
		store.claim(call.id, 'alice'); store.recover();
		expect(store.get(run.id)?.status).toBe('failed'); expect(store.call(call.id)?.status).toBe('failed');
		expect(() => store.claim(call.id, 'alice')).toThrow();
	});
	it('enforces terminal states and records durable audit events', () => {
		const store = database(); const run = running(store);
		store.transition(run.id, 'completed', 'alice');
		expect(() => store.transition(run.id, 'running', 'alice')).toThrow();
		expect(() => prepare(store, run.id)).toThrow();
		expect(store.events(run.id).map((e) => e.action)).toEqual(['run.queued', 'run.running', 'run.completed']);
	});
	it('isolates lists by company and owner', () => {
		const store = database(); const run = running(store); running(store, 'bob'); running(store, 'alice', 'company-b');
		expect(store.list('company-a', 'alice').map((r) => r.id)).toEqual([run.id]);
	});
	it('rolls back state changes when the audit cannot be written', () => {
		const store = database(); const run = running(store);
		store.db.exec("CREATE TRIGGER reject_audit BEFORE INSERT ON runtime_events BEGIN SELECT RAISE(ABORT, 'audit unavailable'); END;");
		expect(() => store.transition(run.id, 'completed', 'alice')).toThrow();
		expect(store.get(run.id)?.status).toBe('running');
	});
});

describe('encryption', () => {
	it('round trips with unique IVs and rejects tampering', () => {
		const one = encrypt('private'); const two = encrypt('private');
		expect(one).not.toBe(two); expect(decrypt(one)).toBe('private');
		const bytes = Buffer.from(one, 'base64'); bytes[bytes.length - 1] ^= 1;
		expect(() => decrypt(bytes.toString('base64'))).toThrow();
	});
});
