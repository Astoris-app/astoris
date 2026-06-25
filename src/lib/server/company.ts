// Firma: Name, Branche, Mission + Rollen + Unteragenten (Paperclip-Stil).
// Persistenz in data/company.json. Branchen-Vorlagen schlagen Rollen vor.

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const FILE = 'data/company.json';

export type Role = { id: string; title: string; description: string };
export type AgentModel = { source: 'local' | 'cloud'; model: string };
export type Agent = { id: string; name: string; role: string; personaId: string; status: 'idle' | 'active'; model?: AgentModel | null };
export type Company = {
	name: string;
	industry: string;
	mission: string;
	roles: Role[];
	agents: Agent[];
};

const EMPTY: Company = { name: '', industry: '', mission: '', roles: [], agents: [] };

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
export function removeAgent(id: string): Company {
	const c = load();
	c.agents = c.agents.filter((a) => a.id !== id);
	save(c);
	return c;
}
