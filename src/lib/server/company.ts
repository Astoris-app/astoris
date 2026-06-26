// Firma: Name, Branche, Mission + Rollen + Unteragenten (Paperclip-Stil).
// Persistenz in data/company.json. Branchen-Vorlagen schlagen Rollen vor.

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const FILE = 'data/company.json';

export type Role = { id: string; title: string; description: string };
export type AgentModel = { source: 'local' | 'cloud'; model: string };
export type TaskEntry = { task: string; result: string; at: string };
export type Agent = { id: string; name: string; role: string; personaId: string; status: 'idle' | 'active'; model?: AgentModel | null; tools?: string[]; history?: TaskEntry[] };
export type GoalStatus = 'geplant' | 'aktiv' | 'blockiert' | 'erledigt';
export type GoalPriority = 'hoch' | 'mittel' | 'niedrig';
export type GoalMetric = { name: string; target: number; current: number; unit: string };
export type Goal = {
	id: string;
	title: string;
	description?: string;
	parentId?: string | null;
	status: GoalStatus;
	metric?: GoalMetric;
	deadline?: string;
	priority: GoalPriority;
	agentIds: string[];
	createdAt: string;
};
export type MemoryCategory = 'firma' | 'produkt' | 'kunde' | 'marke' | 'entscheidung' | 'nicht-tun' | 'experiment';
export type MemoryEntry = {
	id: string;
	category: MemoryCategory;
	title: string;
	content: string;
	at: string;
};
export type FeedType = 'agent-task' | 'company-run' | 'goal' | 'system';
export type FeedEntry = {
	id: string;
	type: FeedType;
	agentId?: string;
	agentName?: string;
	title: string;
	detail?: string;
	at: string;
};
export type Company = {
	name: string;
	industry: string;
	mission: string;
	knowledge?: string;
	memory?: MemoryEntry[];
	roles: Role[];
	agents: Agent[];
	goals?: Goal[];
	feed?: FeedEntry[];
};

export const MEMORY_CATEGORIES: MemoryCategory[] = ['firma', 'produkt', 'kunde', 'marke', 'entscheidung', 'nicht-tun', 'experiment'];

const FEED_MAX = 100;

const EMPTY: Company = { name: '', industry: '', mission: '', roles: [], agents: [], goals: [], feed: [], memory: [] };

// Branchen-Vorlagen → vorgeschlagene Rollen (das "coole" Auto-Setup)
export const INDUSTRY_TEMPLATES: Record<string, { label: string; roles: { title: string; description: string }[] }> = {
	software: { label: 'Softwarefirma', roles: [
		{ title: 'Produktchef', description: 'Priorisiert Features, schreibt Anforderungen.' },
		{ title: 'Entwickler', description: 'Baut und testet Funktionen.' },
		{ title: 'Designer', description: 'Gestaltet UI/UX und Prototypen.' },
		{ title: 'QA', description: 'Prüft Qualität, findet Fehler.' },
		{ title: 'Marketing', description: 'Texte, Launch, Reichweite.' }
	]},
	agentur: { label: 'Kreativagentur', roles: [
		{ title: 'Kreativdirektor', description: 'Setzt die kreative Richtung.' },
		{ title: 'Texter', description: 'Schreibt Claims, Copy, Konzepte.' },
		{ title: 'Designer', description: 'Visuals, Layouts, Branding.' },
		{ title: 'Account', description: 'Kundenkontakt, Briefings, Timing.' }
	]},
	beratung: { label: 'Beratung', roles: [
		{ title: 'Analyst', description: 'Recherchiert, wertet Daten aus.' },
		{ title: 'Berater', description: 'Entwickelt Empfehlungen.' },
		{ title: 'Researcher', description: 'Sammelt Quellen und Fakten.' }
	]},
	shop: { label: 'Online-Shop', roles: [
		{ title: 'Einkauf', description: 'Sortiment, Lieferanten, Preise.' },
		{ title: 'Marketing', description: 'Kampagnen, SEO, Social.' },
		{ title: 'Support', description: 'Kundenanfragen, Retouren.' },
		{ title: 'Versand', description: 'Logistik, Bestellabwicklung.' }
	]}
};

function load(): Company {
	if (!existsSync(FILE)) return { ...EMPTY };
	try { return { ...EMPTY, ...JSON.parse(readFileSync(FILE, 'utf8')) } as Company; } catch { return { ...EMPTY }; }
}
function save(c: Company) {
	mkdirSync('data', { recursive: true });
	writeFileSync(FILE, JSON.stringify(c, null, 2), { mode: 0o600 });
}

export function getCompany(): Company { return load(); }
export function saveCompany(patch: Partial<Company>): Company {
	const c = { ...load(), ...patch };
	save(c);
	return c;
}
export function addRole(title: string, description: string): Company {
	const c = load();
	c.roles.push({ id: randomUUID(), title, description });
	save(c);
	return c;
}
export function removeRole(id: string): Company {
	const c = load();
	c.roles = c.roles.filter((r) => r.id !== id);
	save(c);
	return c;
}
export function addAgent(name: string, role: string, personaId: string): Company {
	const c = load();
	c.agents.push({ id: randomUUID(), name, role, personaId, status: 'idle', model: null });
	save(c);
	return c;
}
export function setAgentModel(id: string, model: AgentModel | null): Company {
	const c = load();
	const a = c.agents.find((x) => x.id === id);
	if (a) a.model = model;
	save(c);
	return c;
}
export function setAgentTools(id: string, tools: string[]): Company {
	const c = load();
	const a = c.agents.find((x) => x.id === id);
	if (a) a.tools = tools;
	save(c);
	return c;
}
export function addAgentHistory(id: string, entry: TaskEntry): Company {
	const c = load();
	const a = c.agents.find((x) => x.id === id);
	if (a) a.history = [entry, ...(a.history ?? [])].slice(0, 20);
	save(c);
	return c;
}
export function clearAgentHistory(id: string): Company {
	const c = load();
	const a = c.agents.find((x) => x.id === id);
	if (a) a.history = [];
	save(c);
	return c;
}
export function removeAgent(id: string): Company {
	const c = load();
	c.agents = c.agents.filter((a) => a.id !== id);
	save(c);
	return c;
}

// ---------- Goals (Ziele) ----------
// Hauptziele haben parentId null, Unterziele verweisen auf die Hauptziel-id.

const VALID_STATUS: GoalStatus[] = ['geplant', 'aktiv', 'blockiert', 'erledigt'];
const VALID_PRIORITY: GoalPriority[] = ['hoch', 'mittel', 'niedrig'];

function goalsOf(c: Company): Goal[] {
	if (!Array.isArray(c.goals)) c.goals = [];
	return c.goals;
}

export function addGoal(input: {
	title: string;
	description?: string;
	parentId?: string | null;
	status?: GoalStatus;
	metric?: GoalMetric;
	deadline?: string;
	priority?: GoalPriority;
	agentIds?: string[];
}): Company {
	const c = load();
	const goals = goalsOf(c);
	// Only allow a parent that exists and is itself a top-level goal (no deeper nesting).
	let parentId: string | null = null;
	if (input.parentId) {
		const parent = goals.find((g) => g.id === input.parentId);
		if (parent && !parent.parentId) parentId = parent.id;
	}
	goals.push({
		id: randomUUID(),
		title: input.title,
		description: input.description || undefined,
		parentId,
		status: VALID_STATUS.includes(input.status as GoalStatus) ? (input.status as GoalStatus) : 'geplant',
		metric: input.metric,
		deadline: input.deadline || undefined,
		priority: VALID_PRIORITY.includes(input.priority as GoalPriority) ? (input.priority as GoalPriority) : 'mittel',
		agentIds: Array.isArray(input.agentIds) ? input.agentIds : [],
		createdAt: new Date().toISOString()
	});
	save(c);
	return c;
}

export function updateGoal(id: string, patch: Partial<Omit<Goal, 'id' | 'createdAt'>>): Company {
	const c = load();
	const goals = goalsOf(c);
	const g = goals.find((x) => x.id === id);
	if (g) {
		if (typeof patch.title === 'string' && patch.title.trim()) g.title = patch.title.trim();
		if (typeof patch.description === 'string') g.description = patch.description.trim() || undefined;
		if (patch.status && VALID_STATUS.includes(patch.status)) g.status = patch.status;
		if (patch.priority && VALID_PRIORITY.includes(patch.priority)) g.priority = patch.priority;
		if ('deadline' in patch) g.deadline = patch.deadline || undefined;
		if ('metric' in patch) g.metric = patch.metric || undefined;
		if (Array.isArray(patch.agentIds)) g.agentIds = patch.agentIds;
		if ('parentId' in patch) {
			let parentId: string | null = null;
			if (patch.parentId) {
				const parent = goals.find((p) => p.id === patch.parentId);
				if (parent && !parent.parentId && parent.id !== id) parentId = parent.id;
			}
			g.parentId = parentId;
		}
	}
	save(c);
	return c;
}

export function removeGoal(id: string): Company {
	const c = load();
	const goals = goalsOf(c);
	// Remove the goal and all of its sub-goals.
	c.goals = goals.filter((g) => g.id !== id && g.parentId !== id);
	save(c);
	return c;
}

export function setGoalStatus(id: string, status: GoalStatus): Company {
	const c = load();
	const g = goalsOf(c).find((x) => x.id === id);
	if (g && VALID_STATUS.includes(status)) g.status = status;
	save(c);
	return c;
}

export function updateGoalMetric(id: string, metric: GoalMetric | null): Company {
	const c = load();
	const g = goalsOf(c).find((x) => x.id === id);
	if (g) g.metric = metric || undefined;
	save(c);
	return c;
}

// ---------- Memory (strukturiertes Firmen-Wissen) ----------
// Kategorisierte Wissens-Einträge, die die Agenten aktiv nutzen.

function memoryOf(c: Company): MemoryEntry[] {
	if (!Array.isArray(c.memory)) c.memory = [];
	return c.memory;
}

function validCategory(v: unknown): MemoryCategory {
	return MEMORY_CATEGORIES.includes(v as MemoryCategory) ? (v as MemoryCategory) : 'firma';
}

export function addMemory(input: { category?: MemoryCategory; title: string; content: string }): Company {
	const c = load();
	const mem = memoryOf(c);
	const title = (input.title ?? '').toString().trim();
	const content = (input.content ?? '').toString().trim();
	mem.push({
		id: randomUUID(),
		category: validCategory(input.category),
		title,
		content,
		at: new Date().toISOString()
	});
	save(c);
	// Feed-Eintrag (skip-on-fail, darf den Haupt-Flow nie brechen).
	try { addFeedEntry({ type: 'system', title: 'Wissen ergänzt: ' + (title || content).slice(0, 80) }); } catch { /* feed write must never break the main flow */ }
	return c;
}

export function updateMemory(id: string, patch: Partial<Pick<MemoryEntry, 'category' | 'title' | 'content'>>): Company {
	const c = load();
	const m = memoryOf(c).find((x) => x.id === id);
	if (m) {
		if (typeof patch.title === 'string') m.title = patch.title.trim();
		if (typeof patch.content === 'string') m.content = patch.content.trim();
		if (patch.category) m.category = validCategory(patch.category);
	}
	save(c);
	return c;
}

export function removeMemory(id: string): Company {
	const c = load();
	c.memory = memoryOf(c).filter((m) => m.id !== id);
	save(c);
	return c;
}

// ---------- Feed (Aktivitätsstrom) ----------
// Newest entry first, hard-capped at FEED_MAX (oldest dropped).

export function addFeedEntry(entry: Omit<FeedEntry, 'id' | 'at'>): Company {
	const c = load();
	if (!Array.isArray(c.feed)) c.feed = [];
	const full: FeedEntry = { ...entry, id: randomUUID(), at: new Date().toISOString() };
	c.feed = [full, ...c.feed].slice(0, FEED_MAX);
	save(c);
	return c;
}

export function clearFeed(): Company {
	const c = load();
	c.feed = [];
	save(c);
	return c;
}
