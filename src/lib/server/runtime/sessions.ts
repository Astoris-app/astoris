import type { DatabaseSync } from 'node:sqlite';
import { createHash, randomBytes } from 'node:crypto';

export type Session = { user: string; method: 'password' | 'tailscale'; expires: number };
const digest = (value: string) => createHash('sha256').update(value).digest('hex');

/** Only hashes of bearer tokens are stored; session contents use the application codec. */
export class SessionStore {
	constructor(private db: DatabaseSync, private codec: { encrypt(value: string): string; decrypt(value: string): string }) {
		db.exec(`CREATE TABLE IF NOT EXISTS auth_sessions(token_hash TEXT PRIMARY KEY, user_hash TEXT NOT NULL, expires INTEGER NOT NULL, payload TEXT NOT NULL);
			CREATE INDEX IF NOT EXISTS sessions_user ON auth_sessions(user_hash);
			CREATE TABLE IF NOT EXISTS auth_attempts(key_hash TEXT PRIMARY KEY, count INTEGER NOT NULL, until_at INTEGER NOT NULL);
			CREATE TABLE IF NOT EXISTS auth_migrations(name TEXT PRIMARY KEY);`);
	}
	private save(token: string, session: Session) {
		this.db.prepare('INSERT OR IGNORE INTO auth_sessions VALUES(?,?,?,?)').run(digest(token), digest(session.user), session.expires, this.codec.encrypt(JSON.stringify(session)));
	}
	migrateLegacy(load: () => Record<string, Session>) {
		this.db.exec('BEGIN IMMEDIATE');
		try {
			if (!this.db.prepare("SELECT name FROM auth_migrations WHERE name='sessions-v1'").get()) {
				for (const [token, session] of Object.entries(load())) {
					if (/^[a-f0-9]{64}$/.test(token) && typeof session?.user === 'string' && ['password', 'tailscale'].includes(session.method) && session.expires > Date.now()) this.save(token, session);
				}
				this.db.prepare('INSERT INTO auth_migrations VALUES(?)').run('sessions-v1');
			}
			this.db.exec('COMMIT');
		} catch (e) { this.db.exec('ROLLBACK'); throw e; }
	}
	create(user: string, method: Session['method']): string {
		const value = randomBytes(32).toString('hex');
		this.save(value, { user, method, expires: Date.now() + 30 * 86400000 }); return value;
	}
	get(token: string): Session | null {
		if (!/^[a-f0-9]{64}$/.test(token)) return null;
		const row = this.db.prepare('SELECT payload, expires FROM auth_sessions WHERE token_hash=?').get(digest(token)) as { payload: string; expires: number } | undefined;
		if (!row) return null;
		if (row.expires <= Date.now()) { this.delete(token); return null; }
		return JSON.parse(this.codec.decrypt(row.payload)) as Session;
	}
	delete(token: string) { this.db.prepare('DELETE FROM auth_sessions WHERE token_hash=?').run(digest(token)); }
	deleteUser(user: string) { this.db.prepare('DELETE FROM auth_sessions WHERE user_hash=?').run(digest(user)); }
	allowed(key: string) {
		const row = this.db.prepare('SELECT count, until_at FROM auth_attempts WHERE key_hash=?').get(digest(key)) as { count: number; until_at: number } | undefined;
		const remaining = row ? row.until_at - Date.now() : 0;
		return { allowed: !row || row.count < 5 || remaining <= 0, retryAfter: row && row.count >= 5 && remaining > 0 ? Math.ceil(remaining / 1000) : 0 };
	}
	failure(key: string) {
		const now = Date.now();
		this.db.prepare(`INSERT INTO auth_attempts VALUES(?,1,?) ON CONFLICT(key_hash) DO UPDATE SET
			count=CASE WHEN until_at>? THEN count+1 ELSE 1 END, until_at=CASE WHEN until_at>? THEN until_at ELSE excluded.until_at END`)
			.run(digest(key), now + 15 * 60000, now, now);
		this.db.prepare('DELETE FROM auth_attempts WHERE until_at < ?').run(now);
	}
	clear(key: string) { this.db.prepare('DELETE FROM auth_attempts WHERE key_hash=?').run(digest(key)); }
}
