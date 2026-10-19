import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { chmodSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export type RunStatus = 'queued' | 'running' | 'waiting_for_approval' | 'completed' | 'failed' | 'cancelled';
export type ToolStatus = 'pending' | 'approved' | 'running' | 'completed' | 'failed' | 'rejected' | 'cancelled';
export type Run = {
	id: string; companyId: string; owner: string; status: RunStatus; createdAt: string; updatedAt: string;
	agentId?: string; title: string; result?: unknown; error?: string;
};
export type ToolCall = {
	id: string; runId: string; name: string; args: Record<string, unknown>; status: ToolStatus;
	risk: 'read' | 'draft' | 'write' | 'external'; reason: string; fingerprint: string;
	createdAt: string; result?: unknown; error?: string;
};
type Codec = { encrypt(value: string): string; decrypt(value: string): string };
const transitions: Record<RunStatus, RunStatus[]> = {
	queued: ['running', 'cancelled', 'failed'], running: ['waiting_for_approval', 'completed', 'failed', 'cancelled'],
	waiting_for_approval: ['completed', 'failed', 'cancelled'], completed: [], failed: [], cancelled: []
};

/** Each state change and its audit event commit together. Payloads are encrypted by the caller. */
export class RuntimeStore {
	readonly db: DatabaseSync;
	constructor(path: string, private codec: Codec) {
		if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
		this.db = new DatabaseSync(path);
		if (path !== ':memory:') chmodSync(path, 0o600);
		this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;
			CREATE TABLE IF NOT EXISTS runtime_schema(version INTEGER PRIMARY KEY);
			INSERT OR IGNORE INTO runtime_schema VALUES(1);
			CREATE TABLE IF NOT EXISTS runs(id TEXT PRIMARY KEY, company_id TEXT NOT NULL, owner TEXT NOT NULL,
				status TEXT NOT NULL, payload TEXT NOT NULL, updated_at TEXT NOT NULL);
			CREATE INDEX IF NOT EXISTS runs_scope ON runs(company_id, owner, updated_at);
			CREATE TABLE IF NOT EXISTS tool_calls(id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES runs(id),
				status TEXT NOT NULL, payload TEXT NOT NULL);
			CREATE INDEX IF NOT EXISTS calls_run ON tool_calls(run_id);
			CREATE TABLE IF NOT EXISTS runtime_events(seq INTEGER PRIMARY KEY AUTOINCREMENT, run_id TEXT NOT NULL REFERENCES runs(id),
				at TEXT NOT NULL, action TEXT NOT NULL, actor TEXT NOT NULL, target_id TEXT);
		`);
	}
	close() { this.db.close(); }
	private encode(value: unknown) { return this.codec.encrypt(JSON.stringify(value)); }
	private decode<T>(row: unknown): T | null {
		return row ? JSON.parse(this.codec.decrypt((row as { payload: string }).payload)) as T : null;
	}
	private tx<T>(work: () => T): T {
		this.db.exec('BEGIN IMMEDIATE');
		try { const result = work(); this.db.exec('COMMIT'); return result; }
		catch (e) { this.db.exec('ROLLBACK'); throw e; }
	}
	private event(runId: string, action: string, actor: string, targetId?: string) {
		this.db.prepare('INSERT INTO runtime_events(run_id, at, action, actor, target_id) VALUES(?,?,?,?,?)')
			.run(runId, new Date().toISOString(), action, actor, targetId ?? null);
	}
	create(input: Pick<Run, 'companyId' | 'owner' | 'title' | 'agentId'>): Run {
		const at = new Date().toISOString();
		const run: Run = { ...input, id: randomUUID(), status: 'queued', createdAt: at, updatedAt: at };
		return this.tx(() => {
			this.db.prepare('INSERT INTO runs VALUES(?,?,?,?,?,?)').run(run.id, run.companyId, run.owner, run.status, this.encode(run), at);
			this.event(run.id, 'run.queued', run.owner); return run;
		});
	}
	get(id: string) { return this.decode<Run>(this.db.prepare('SELECT payload FROM runs WHERE id=?').get(id)); }
	list(companyId: string, owner: string, limit = 50): Run[] {
		return this.db.prepare('SELECT payload FROM runs WHERE company_id=? AND owner=? ORDER BY updated_at DESC LIMIT ?')
			.all(companyId, owner, Math.max(1, Math.min(200, limit))).map((r) => this.decode<Run>(r)!);
	}
	private saveRun(run: Run) {
		run.updatedAt = new Date().toISOString();
		this.db.prepare('UPDATE runs SET status=?, payload=?, updated_at=? WHERE id=?')
			.run(run.status, this.encode(run), run.updatedAt, run.id);
	}
	transition(id: string, status: RunStatus, actor: string, patch: Pick<Run, 'result' | 'error'> = {}): Run {
		return this.tx(() => {
			const run = this.get(id);
			if (!run || !transitions[run.status].includes(status)) throw new Error('Ungültiger Laufstatus.');
			Object.assign(run, patch, { status }); this.saveRun(run); this.event(id, `run.${status}`, actor);
			if (status === 'cancelled' || status === 'failed') {
				for (const call of this.calls(id).filter((c) => ['pending', 'approved'].includes(c.status))) {
					call.status = 'cancelled'; this.saveCall(call); this.event(id, 'tool.cancelled', actor, call.id);
				}
			}
			return run;
		});
	}
	calls(runId: string): ToolCall[] {
		return this.db.prepare('SELECT payload FROM tool_calls WHERE run_id=? ORDER BY rowid').all(runId).map((r) => this.decode<ToolCall>(r)!);
	}
	call(id: string) { return this.decode<ToolCall>(this.db.prepare('SELECT payload FROM tool_calls WHERE id=?').get(id)); }
	private saveCall(call: ToolCall) {
		this.db.prepare('UPDATE tool_calls SET status=?, payload=? WHERE id=?').run(call.status, this.encode(call), call.id);
	}
	prepare(input: Omit<ToolCall, 'id' | 'createdAt' | 'status'>, approval: boolean): ToolCall {
		return this.tx(() => {
			const run = this.get(input.runId);
			if (run?.status !== 'running') throw new Error('Lauf ist nicht aktiv.');
			const call: ToolCall = { ...input, id: randomUUID(), createdAt: new Date().toISOString(), status: approval ? 'pending' : 'approved' };
			this.db.prepare('INSERT INTO tool_calls VALUES(?,?,?,?)').run(call.id, call.runId, call.status, this.encode(call));
			this.event(run.id, approval ? 'tool.approval_requested' : 'tool.prepared', run.owner, call.id); return call;
		});
	}
	decide(id: string, approve: boolean, actor: string): ToolCall {
		return this.tx(() => {
			const call = this.call(id);
			const run = call && this.get(call.runId);
			if (!call || call.status !== 'pending' || run?.status !== 'waiting_for_approval' || run.owner !== actor) throw new Error('Freigabe ist nicht mehr offen.');
			call.status = approve ? 'approved' : 'rejected'; this.saveCall(call);
			this.event(call.runId, `tool.${call.status}`, actor, id); return call;
		});
	}
	claim(id: string, actor: string): ToolCall {
		return this.tx(() => {
			const call = this.call(id);
			const run = call && this.get(call.runId);
			if (!call || call.status !== 'approved' || !run || !['running', 'waiting_for_approval'].includes(run.status)) throw new Error('Werkzeug kann nicht gestartet werden.');
			call.status = 'running'; this.saveCall(call); this.event(call.runId, 'tool.running', actor, id); return call;
		});
	}
	finish(id: string, result: unknown, error?: string) {
		return this.tx(() => {
			const call = this.call(id);
			if (!call || call.status !== 'running') throw new Error('Werkzeug ist nicht aktiv.');
			call.status = error ? 'failed' : 'completed'; call.result = result; call.error = error;
			this.saveCall(call); this.event(call.runId, `tool.${call.status}`, 'runtime', id); return call;
		});
	}
	settle(id: string) {
		const run = this.get(id);
		if (run?.status !== 'waiting_for_approval') return;
		const calls = this.calls(id);
		if (calls.some((c) => ['pending', 'approved', 'running'].includes(c.status))) return;
		this.transition(id, calls.some((c) => c.status === 'failed') ? 'failed' : 'completed', 'runtime');
	}
	events(id: string) {
		return this.db.prepare('SELECT seq, at, action, actor, target_id AS targetId FROM runtime_events WHERE run_id=? ORDER BY seq').all(id);
	}
	recordToolDenial(runId: string, name: string, actor: string) {
		this.tx(() => { this.event(runId, 'tool.denied', actor, String(name).slice(0, 64)); });
	}
	/** Called once at process startup. Never replay effects after a crash. Pending approvals survive. */
	recover() {
		this.tx(() => {
			const rows = this.db.prepare("SELECT payload FROM runs WHERE status IN ('queued','running','waiting_for_approval')").all();
			for (const row of rows) {
				const run = this.decode<Run>(row)!;
				let interrupted = run.status !== 'waiting_for_approval';
				for (const call of this.calls(run.id)) {
					if (call.status === 'running' || call.status === 'approved') {
						call.status = 'failed'; call.error = 'Ausführung durch Neustart unterbrochen; Wirkung vor erneutem Start prüfen.';
						this.saveCall(call); this.event(run.id, 'tool.interrupted', 'runtime', call.id); interrupted = true;
					}
				}
				if (interrupted) {
					run.status = 'failed'; run.error = 'Lauf durch Neustart unterbrochen. Keine automatische Wiederholung.';
					this.saveRun(run); this.event(run.id, 'run.interrupted', 'runtime');
					for (const call of this.calls(run.id).filter((c) => c.status === 'pending')) {
						call.status = 'cancelled'; this.saveCall(call); this.event(run.id, 'tool.cancelled', 'runtime', call.id);
					}
				}
			}
		});
		for (const row of this.db.prepare("SELECT id FROM runs WHERE status='waiting_for_approval'").all()) this.settle(String(row.id));
	}
}
