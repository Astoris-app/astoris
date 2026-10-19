import { beforeEach, afterEach, expect, it } from 'vitest';
import { RuntimeStore } from '../src/lib/server/runtime/store';
import { DocumentStore } from '../src/lib/server/runtime/documents';
import { encrypt, decrypt } from '../src/lib/server/crypto';
let runtime: RuntimeStore; let docs: DocumentStore;
beforeEach(() => { runtime = new RuntimeStore(':memory:', { encrypt, decrypt }); docs = new DocumentStore(runtime.db, { encrypt, decrypt }); });
afterEach(() => runtime.close());
it('imports legacy content once and preserves arbitrary model fields', () => {
	const initial = docs.read('company', () => ({ name: 'old', custom: { nested: true } }));
	docs.write('company', { ...initial.value, name: 'new' }, initial.version);
	expect(docs.read('company', () => { throw new Error('must not reread legacy'); }).value).toEqual({ name: 'new', custom: { nested: true } });
});
it('refuses a stale write instead of silently losing concurrent changes', () => {
	const first = docs.read('calendar', () => ['A']); const second = docs.read('calendar', () => []);
	docs.write('calendar', ['A', 'B'], first.version);
	expect(() => docs.write('calendar', ['A', 'C'], second.version)).toThrow();
	expect(docs.read('calendar', () => []).value).toEqual(['A', 'B']);
});
it('does not leave a half-migrated row when legacy input is broken', () => {
	expect(() => docs.read('broken', () => JSON.parse('{'))).toThrow();
	expect(runtime.db.prepare('SELECT key FROM documents WHERE key=?').get('broken')).toBeUndefined();
});
it('encrypts document payloads', () => {
	docs.read('private', () => ({ content: 'secret business context' }));
	expect(JSON.stringify(runtime.db.prepare('SELECT * FROM documents').all())).not.toContain('secret business context');
});
