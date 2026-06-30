// CRM-Light: Kontakte/Leads, Deal-Pipeline, Produkte.
// Persistenz in data/crm.json (mode 0o600), Muster wie company.ts.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { companyDir } from './companies';

// Pfad der crm.json der aktiven Firma (data/companies/<id>/crm.json).
function file(): string {
	return join(companyDir(), 'crm.json');
}

export type ContactType = 'lead' | 'kunde' | 'kontakt';
export type Contact = {
	id: string;
	name: string;
	company?: string;
	email?: string;
	phone?: string;
	type: ContactType;
	notes?: string;
	createdAt: string;
};

export type DealStage = 'neu' | 'qualifiziert' | 'angebot' | 'gewonnen' | 'verloren';
export type Deal = {
	id: string;
	title: string;
	contactId?: string;
	value?: number;
	currency?: string;
	stage: DealStage;
	notes?: string;
	createdAt: string;
};

export type Product = {
	id: string;
	name: string;
	price?: number;
	currency?: string;
	description?: string;
};

export type Crm = {
	contacts: Contact[];
	deals: Deal[];
	products: Product[];
};

export const CONTACT_TYPES: ContactType[] = ['lead', 'kunde', 'kontakt'];
export const DEAL_STAGES: DealStage[] = ['neu', 'qualifiziert', 'angebot', 'gewonnen', 'verloren'];

const EMPTY: Crm = { contacts: [], deals: [], products: [] };

function load(): Crm {
	const FILE = file();
	if (!existsSync(FILE)) return { ...EMPTY };
	try {
		const raw = JSON.parse(readFileSync(FILE, 'utf8'));
		return {
			contacts: Array.isArray(raw?.contacts) ? raw.contacts : [],
			deals: Array.isArray(raw?.deals) ? raw.deals : [],
			products: Array.isArray(raw?.products) ? raw.products : []
		};
	} catch {
		return { ...EMPTY };
	}
}

function save(c: Crm) {
	writeFileSync(file(), JSON.stringify(c, null, 2), { mode: 0o600 });
}

export function getCrm(): Crm {
	return load();
}

// ---------- Helpers ----------
function validType(v: unknown): ContactType {
	return CONTACT_TYPES.includes(v as ContactType) ? (v as ContactType) : 'lead';
}
function validStage(v: unknown): DealStage {
	return DEAL_STAGES.includes(v as DealStage) ? (v as DealStage) : 'neu';
}
function str(v: unknown): string {
	return (v ?? '').toString().trim();
}
// Parses a numeric value or undefined if empty/unparseable.
function num(v: unknown): number | undefined {
	if (v === '' || v === null || v === undefined) return undefined;
	const n = Number(v);
	return Number.isFinite(n) ? n : undefined;
}

// ---------- Contacts ----------
export function addContact(input: {
	name: string;
	company?: string;
	email?: string;
	phone?: string;
	type?: ContactType;
	notes?: string;
}): Contact[] {
	const c = load();
	c.contacts.push({
		id: randomUUID(),
		name: str(input.name),
		company: str(input.company) || undefined,
		email: str(input.email) || undefined,
		phone: str(input.phone) || undefined,
		type: validType(input.type),
		notes: str(input.notes) || undefined,
		createdAt: new Date().toISOString()
	});
	save(c);
	return c.contacts;
}

export function updateContact(id: string, patch: Partial<Omit<Contact, 'id' | 'createdAt'>>): Contact[] {
	const c = load();
	const x = c.contacts.find((e) => e.id === id);
	if (x) {
		if (typeof patch.name === 'string' && patch.name.trim()) x.name = patch.name.trim();
		if ('company' in patch) x.company = str(patch.company) || undefined;
		if ('email' in patch) x.email = str(patch.email) || undefined;
		if ('phone' in patch) x.phone = str(patch.phone) || undefined;
		if (patch.type) x.type = validType(patch.type);
		if ('notes' in patch) x.notes = str(patch.notes) || undefined;
	}
	save(c);
	return c.contacts;
}

export function removeContact(id: string): Contact[] {
	const c = load();
	c.contacts = c.contacts.filter((e) => e.id !== id);
	// Unlink the contact from any deals that referenced it (keep the deals).
	for (const d of c.deals) if (d.contactId === id) d.contactId = undefined;
	save(c);
	return c.contacts;
}

// ---------- Deals ----------
export function addDeal(input: {
	title: string;
	contactId?: string;
	value?: number;
	currency?: string;
	stage?: DealStage;
	notes?: string;
}): Deal[] {
	const c = load();
	// Only keep contactId if it actually resolves to an existing contact.
	const contactId = input.contactId && c.contacts.some((x) => x.id === input.contactId) ? input.contactId : undefined;
	c.deals.push({
		id: randomUUID(),
		title: str(input.title),
		contactId,
		value: num(input.value),
		currency: str(input.currency) || undefined,
		stage: validStage(input.stage),
		notes: str(input.notes) || undefined,
		createdAt: new Date().toISOString()
	});
	save(c);
	return c.deals;
}

export function updateDeal(id: string, patch: Partial<Omit<Deal, 'id' | 'createdAt'>>): Deal[] {
	const c = load();
	const x = c.deals.find((e) => e.id === id);
	if (x) {
		if (typeof patch.title === 'string' && patch.title.trim()) x.title = patch.title.trim();
		if ('contactId' in patch) x.contactId = patch.contactId && c.contacts.some((ct) => ct.id === patch.contactId) ? patch.contactId : undefined;
		if ('value' in patch) x.value = num(patch.value);
		if ('currency' in patch) x.currency = str(patch.currency) || undefined;
		if (patch.stage) x.stage = validStage(patch.stage);
		if ('notes' in patch) x.notes = str(patch.notes) || undefined;
	}
	save(c);
	return c.deals;
}

export function removeDeal(id: string): Deal[] {
	const c = load();
	c.deals = c.deals.filter((e) => e.id !== id);
	save(c);
	return c.deals;
}

// ---------- Products ----------
export function addProduct(input: {
	name: string;
	price?: number;
	currency?: string;
	description?: string;
}): Product[] {
	const c = load();
	c.products.push({
		id: randomUUID(),
		name: str(input.name),
		price: num(input.price),
		currency: str(input.currency) || undefined,
		description: str(input.description) || undefined
	});
	save(c);
	return c.products;
}

export function updateProduct(id: string, patch: Partial<Omit<Product, 'id'>>): Product[] {
	const c = load();
	const x = c.products.find((e) => e.id === id);
	if (x) {
		if (typeof patch.name === 'string' && patch.name.trim()) x.name = patch.name.trim();
		if ('price' in patch) x.price = num(patch.price);
		if ('currency' in patch) x.currency = str(patch.currency) || undefined;
		if ('description' in patch) x.description = str(patch.description) || undefined;
	}
	save(c);
	return c.products;
}

export function removeProduct(id: string): Product[] {
	const c = load();
	c.products = c.products.filter((e) => e.id !== id);
	save(c);
	return c.products;
}
