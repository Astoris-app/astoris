import type { DatabaseSync } from 'node:sqlite';

/** Versioned encrypted documents let existing domain models migrate without losing fields. */
export class DocumentStore {
	constructor(private db: DatabaseSync, private codec: { encrypt(value: string): string; decrypt(value: string): string }) {
		db.exec('CREATE TABLE IF NOT EXISTS documents(key TEXT PRIMARY KEY, version INTEGER NOT NULL, payload TEXT NOT NULL, updated_at TEXT NOT NULL)');
	}
	read<T>(key: string, initial: () => T): { value: T; version: number } {
		this.db.exec('BEGIN IMMEDIATE');
		try {
			let row = this.db.prepare('SELECT payload, version FROM documents WHERE key=?').get(key) as { payload: string; version: number } | undefined;
			if (!row) {
				const value = initial();
				row = { payload: this.codec.encrypt(JSON.stringify(value)), version: 1 };
				this.db.prepare('INSERT INTO documents VALUES(?,?,?,?)').run(key, row.version, row.payload, new Date().toISOString());
			}
			const value = JSON.parse(this.codec.decrypt(row.payload)) as T;
			this.db.exec('COMMIT'); return { value, version: row.version };
		} catch (e) { this.db.exec('ROLLBACK'); throw e; }
	}
	write(key: string, value: unknown, expectedVersion: number): number {
		const result = this.db.prepare('UPDATE documents SET version=version+1, payload=?, updated_at=? WHERE key=? AND version=?')
			.run(this.codec.encrypt(JSON.stringify(value)), new Date().toISOString(), key, expectedVersion);
		if (!result.changes) throw new Error('Daten wurden zwischenzeitlich geändert. Bitte neu laden.');
		return expectedVersion + 1;
	}
}
