import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { RuntimeStore } from '../src/lib/server/runtime/store';
import { SessionStore } from '../src/lib/server/runtime/sessions';
import { encrypt, decrypt } from '../src/lib/server/crypto';

let runtime: RuntimeStore; let sessions: SessionStore;
beforeEach(() => { runtime = new RuntimeStore(':memory:', { encrypt, decrypt }); sessions = new SessionStore(runtime.db, { encrypt, decrypt }); });
afterEach(() => { runtime.close(); vi.useRealTimers(); });
it('stores only hashed tokens and encrypted identities', () => {
	const token = sessions.create('private-user', 'password');
	expect(sessions.get(token)?.user).toBe('private-user');
	const rows = JSON.stringify(runtime.db.prepare('SELECT * FROM auth_sessions').all());
	expect(rows).not.toContain(token); expect(rows).not.toContain('private-user');
});
it('migrates legacy sessions once without resurrecting revoked sessions', () => {
	const token = 'b'.repeat(64); const load = vi.fn(() => ({ [token]: { user: 'alice', method: 'password' as const, expires: Date.now() + 60000 } }));
	sessions.migrateLegacy(load); sessions.delete(token);
	new SessionStore(runtime.db, { encrypt, decrypt }).migrateLegacy(load);
	expect(load).toHaveBeenCalledTimes(1); expect(sessions.get(token)).toBe(null);
});
it('expires sessions and supports user-wide revocation', () => {
	vi.useFakeTimers();
	const alice = sessions.create('alice', 'password'); const bob = sessions.create('bob', 'tailscale');
	sessions.deleteUser('alice'); expect(sessions.get(alice)).toBe(null); expect(sessions.get(bob)).not.toBe(null);
	vi.advanceTimersByTime(31 * 86400000); expect(sessions.get(bob)).toBe(null);
});
it('persists lockouts across store recreation and unlocks after expiry', () => {
	vi.useFakeTimers();
	for (let i = 0; i < 5; i++) sessions.failure('client-address');
	expect(new SessionStore(runtime.db, { encrypt, decrypt }).allowed('client-address').allowed).toBe(false);
	vi.advanceTimersByTime(16 * 60000); expect(sessions.allowed('client-address').allowed).toBe(true);
	sessions.failure('client-address'); expect(sessions.allowed('client-address').allowed).toBe(true);
});
