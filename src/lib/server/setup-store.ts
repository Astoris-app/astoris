import type { DatabaseSync } from 'node:sqlite';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { error } from '@sveltejs/kit';
import type { Company } from './company';
import type { AgentScope, SetupDraft, SetupPlan } from '$lib/setup-plan';
import { AGENT_SCOPES } from '$lib/setup-plan';

type Codec = { encrypt(value: string): string; decrypt(value: string): string };
export type AgentAccess = { id: string; name: string; owner: string; method: 'password' | 'tailscale'; companyId: string; scopes: AgentScope[];
	createdAt: string; expiresAt: string; revokedAt?: string };
type PlanRow = { payload: string; status: SetupDraft['status']; company_id: string; owner: string };
const documentKey = (companyId: string) => `companies/${companyId}/company.json`;

export class SetupStore {
	constructor(private db: DatabaseSync, private codec: Codec) {
		db.exec(`CREATE TABLE IF NOT EXISTS setup_plans(id TEXT PRIMARY KEY, company_id TEXT NOT NULL, owner TEXT NOT NULL,
			status TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL);
			CREATE INDEX IF NOT EXISTS setup_plan_scope ON setup_plans(company_id,owner,created_at);
			CREATE TABLE IF NOT EXISTS agent_access(id TEXT PRIMARY KEY, digest TEXT UNIQUE NOT NULL, owner TEXT NOT NULL,
			company_id TEXT NOT NULL, payload TEXT NOT NULL);
			CREATE TABLE IF NOT EXISTS setup_audit(seq INTEGER PRIMARY KEY, company_id TEXT NOT NULL, owner TEXT NOT NULL,
			at TEXT NOT NULL, action TEXT NOT NULL, target_id TEXT NOT NULL);
			CREATE TABLE IF NOT EXISTS setup_limits(key TEXT PRIMARY KEY, until_ms INTEGER NOT NULL, count INTEGER NOT NULL);`);
	}
	private encode(value: unknown) { return this.codec.encrypt(JSON.stringify(value)); }
	private decode<T>(value: string): T { return JSON.parse(this.codec.decrypt(value)); }
	private event(company: string, owner: string, action: string, target: string) {
		this.db.prepare('INSERT INTO setup_audit(company_id,owner,at,action,target_id) VALUES(?,?,?,?,?)')
			.run(company, owner, new Date().toISOString(), action, target);
	}
	private tx<T>(work: () => T): T {
		this.db.exec('BEGIN IMMEDIATE');
		try { const result = work(); this.db.exec('COMMIT'); return result; }
		catch (cause) { this.db.exec('ROLLBACK'); throw cause; }
	}
	limit(key: string, maximum = 5) {
		const now = Date.now();
		this.db.prepare(`INSERT INTO setup_limits VALUES(?,?,1) ON CONFLICT(key) DO UPDATE SET
			count=CASE WHEN until_ms<=? THEN 1 ELSE count+1 END, until_ms=CASE WHEN until_ms<=? THEN ? ELSE until_ms END`)
			.run(key, now + 60000, now, now, now + 60000);
		const row = this.db.prepare('SELECT count FROM setup_limits WHERE key=?').get(key) as { count: number };
		if (row.count > maximum) error(429, 'Zu viele Anfragen / too many requests.');
	}
	version(company: string): number {
		const row = this.db.prepare('SELECT version FROM documents WHERE key=?').get(documentKey(company)) as { version: number } | undefined;
		if (!row) error(409, 'Firmenkontext zuerst laden / load company context first.');
		return row.version;
	}
	create(owner: string, company: string, version: number, plan: SetupPlan): SetupDraft {
		if (this.version(company) !== version) error(409, 'Firma wurde geändert. Plan neu erstellen / company changed; create a new plan.');
		return this.tx(() => {
			const draft: SetupDraft = { id: randomUUID(), owner, companyId: company, baseVersion: version,
				status: 'draft', createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 86400000).toISOString(), plan };
			this.db.prepare('INSERT INTO setup_plans VALUES(?,?,?,?,?,?)')
				.run(draft.id, company, owner, draft.status, this.encode({ draft }), draft.createdAt);
			this.event(company, owner, 'setup.proposed', draft.id); return draft;
		});
	}
	get(id: string, owner: string, company: string): SetupDraft {
		const row = this.db.prepare('SELECT * FROM setup_plans WHERE id=? AND owner=? AND company_id=?')
			.get(id, owner, company) as PlanRow | undefined;
		if (!row) error(404, 'Plan nicht gefunden / plan not found.');
		const draft = this.decode<{ draft: SetupDraft }>(row.payload).draft;
		return { ...draft, status: row.status };
	}
	list(owner: string, company: string) {
		return this.db.prepare('SELECT id FROM setup_plans WHERE owner=? AND company_id=? ORDER BY created_at DESC LIMIT 20')
			.all(owner, company).map((r) => this.get(String(r.id), owner, company));
	}
	decide(id: string, owner: string, company: string, approve: boolean): SetupDraft {
		return this.tx(() => {
			const draft = this.get(id, owner, company);
			if (draft.status === (approve ? 'applied' : 'rejected')) return draft; // retries are harmless
			if (draft.status !== 'draft') error(409, 'Plan bereits abgeschlossen / plan already settled.');
			if (Date.parse(draft.expiresAt) <= Date.now()) error(409, 'Plan abgelaufen / plan expired.');
			let before: unknown;
			if (approve) {
				const row = this.db.prepare('SELECT version,payload FROM documents WHERE key=?').get(documentKey(company)) as { version: number; payload: string };
				if (!row || row.version !== draft.baseVersion) error(409, 'Firma wurde geändert. Plan neu erstellen / company changed; create a new plan.');
				before = this.decode<Partial<Company>>(row.payload);
				const current: Company = { name: '', industry: '', mission: '', roles: [], agents: [], goals: [], ...before as Partial<Company> };
				const next = structuredClone(current);
				Object.assign(next, draft.plan.profile);
				for (const role of draft.plan.roles) {
					if (!next.roles.some((r) => r.title.toLowerCase() === role.title.toLowerCase())) {
						next.roles.push({ ...role, id: randomUUID() });
						next.agents.push({ id: randomUUID(), name: role.title, role: role.title, personaId: 'astoris',
							status: 'idle', tools: [], autonomyLevel: 1 });
					}
				}
				for (const goal of draft.plan.goals) {
					if (!next.goals?.some((g) => g.title.toLowerCase() === goal.title.toLowerCase())) {
						(next.goals ??= []).push({ ...goal, id: randomUUID(), priority: 'mittel', status: 'geplant',
							agentIds: [], createdAt: new Date().toISOString() });
					}
				}
				this.db.prepare('UPDATE documents SET version=version+1,payload=?,updated_at=? WHERE key=? AND version=?')
					.run(this.encode(next), new Date().toISOString(), documentKey(company), row.version);
			}
			draft.status = approve ? 'applied' : 'rejected';
			this.db.prepare('UPDATE setup_plans SET status=?,payload=? WHERE id=?').run(draft.status, this.encode({ draft, before }), id);
			this.event(company, owner, `setup.${draft.status}`, id); return draft;
		});
	}
	issue(owner: string, company: string, name: string, scopes: AgentScope[], days: number, method: 'password' | 'tailscale' = 'password') {
		if (!name.trim() || name.length > 80 || !scopes.length || scopes.some((s) => !AGENT_SCOPES.includes(s)) || !Number.isInteger(days) || days < 1 || days > 30) error(400, 'Ungültiger Agenten-Zugang / invalid agent access.');
		const access: AgentAccess = { id: randomUUID(), owner, method, companyId: company, name: name.trim(), scopes: [...new Set(scopes)],
			createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + days * 86400000).toISOString() };
		const credential = 'astoris_' + randomBytes(32).toString('base64url');
		this.tx(() => {
			this.db.prepare('INSERT INTO agent_access VALUES(?,?,?,?,?)').run(access.id, createHash('sha256').update(credential).digest('hex'), owner, company, this.encode(access));
			this.event(company, owner, 'access.issued', access.id);
		});
		return { access, credential };
	}
	accessList(owner: string, company: string): AgentAccess[] {
		return this.db.prepare('SELECT payload FROM agent_access WHERE owner=? AND company_id=?').all(owner, company)
			.map((r) => this.decode<AgentAccess>(String(r.payload)));
	}
	revoke(id: string, owner: string, company: string) {
		const access = this.accessList(owner, company).find((a) => a.id === id);
		if (!access) error(404);
		if (access.revokedAt) return;
		access.revokedAt = new Date().toISOString();
		this.tx(() => {
			this.db.prepare('UPDATE agent_access SET payload=? WHERE id=?').run(this.encode(access), id);
			this.event(company, owner, 'access.revoked', id);
		});
	}
	authenticate(credential: string): AgentAccess {
		if (!/^astoris_[A-Za-z0-9_-]{43}$/.test(credential)) error(401, 'Agenten-Zugang erforderlich / agent access required.');
		const row = this.db.prepare('SELECT payload FROM agent_access WHERE digest=?').get(createHash('sha256').update(credential).digest('hex'));
		const access = row && this.decode<AgentAccess>(String(row.payload));
		if (!access || access.revokedAt || Date.parse(access.expiresAt) <= Date.now()) error(401, 'Agenten-Zugang abgelaufen oder ungültig / invalid or expired access.');
		return access;
	}
	audit(owner: string, company: string) {
		return this.db.prepare('SELECT at,action,target_id AS targetId FROM setup_audit WHERE owner=? AND company_id=? ORDER BY seq DESC LIMIT 50').all(owner, company);
	}
	recordAccess(access: AgentAccess, action: string) { this.event(access.companyId, access.owner, action, access.id); }
}
