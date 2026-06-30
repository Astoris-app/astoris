// Multi-Company-Registry: verwaltet mehrere Firmen unter data/companies/<id>/...
// Hält die aktive Firma fest und stellt companyDir() für die firma-spezifischen
// Module (company/crm/metrics/optimization/marketing) bereit.
//
// Speicher: data/companies.json = { active, list[] }.
// Daten je Firma: data/companies/<id>/{company,crm,metrics,optimization,marketing}.json
// syslog.json bleibt GLOBAL und wird hier NICHT angefasst.

import {
	existsSync,
	readFileSync,
	writeFileSync,
	mkdirSync,
	renameSync,
	copyFileSync,
	unlinkSync
} from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

const DATA_DIR = 'data';
const COMPANIES_DIR = join(DATA_DIR, 'companies');
const REGISTRY = join(DATA_DIR, 'companies.json');
const TRASH_DIR = join(COMPANIES_DIR, '.trash');

// Firma-spezifische Dateien, die je Firma in deren Verzeichnis liegen.
const COMPANY_FILES = ['company.json', 'crm.json', 'metrics.json', 'optimization.json', 'marketing.json'];

export type CompanyMeta = { id: string; name: string; industry?: string; createdAt: string };
export type Registry = { active: string; list: CompanyMeta[] };

// ---------- low-level helpers ----------

// Liest die Registry; gibt null zurück, wenn sie (noch) nicht existiert oder kaputt ist.
function readRegistry(): Registry | null {
	if (!existsSync(REGISTRY)) return null;
	try {
		const raw = JSON.parse(readFileSync(REGISTRY, 'utf8'));
		const list = Array.isArray(raw?.list)
			? raw.list
					.filter((c: any) => c && typeof c.id === 'string' && c.id)
					.map((c: any): CompanyMeta => ({
						id: c.id,
						name: typeof c.name === 'string' ? c.name : 'Firma',
						industry: c.industry ? String(c.industry) : undefined,
						createdAt: typeof c.createdAt === 'string' ? c.createdAt : new Date().toISOString()
					}))
			: [];
		const active = typeof raw?.active === 'string' ? raw.active : '';
		return { active, list };
	} catch {
		return null;
	}
}

// Schreibt die Registry atomar (temp + rename) mit restriktivem Modus.
function writeRegistry(reg: Registry) {
	mkdirSync(DATA_DIR, { recursive: true });
	const tmp = REGISTRY + '.tmp';
	writeFileSync(tmp, JSON.stringify(reg, null, 2), { mode: 0o600 });
	renameSync(tmp, REGISTRY);
}

// kebab-slug aus einem Firmennamen (a–z, 0–9, Bindestriche).
function slug(name: string): string {
	const s = (name ?? '')
		.toString()
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '') // strip diacritics
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 40);
	return s || 'firma';
}

// Erzeugt eine eindeutige Firma-id (slug + kurzes Suffix), kollidiert nicht mit vorhandenen.
function newId(name: string, taken: Set<string>): string {
	const base = slug(name);
	let id = `${base}-${randomUUID().slice(0, 6)}`;
	while (taken.has(id)) id = `${base}-${randomUUID().slice(0, 6)}`;
	return id;
}

// Verschiebt eine Datei fail-safe: rename (atomar), bei cross-device-Fehler copy + unlink.
// Existiert die Quelle nicht, passiert nichts (idempotent).
function moveFile(src: string, dest: string) {
	if (!existsSync(src)) return;
	try {
		renameSync(src, dest);
	} catch {
		// Cross-device or other rename failure: fall back to copy + delete (never lose data).
		copyFileSync(src, dest);
		unlinkSync(src);
	}
}

// ---------- migration ----------

// Einmalige, idempotente Migration Single-Company -> Multi-Company.
// Läuft nur, solange data/companies.json fehlt. Verschiebt (nicht kopiert) bestehende
// Single-Company-Dateien verlustfrei in das Verzeichnis der neuen Firma.
export function ensureMigrated(): void {
	if (existsSync(REGISTRY)) return;

	mkdirSync(COMPANIES_DIR, { recursive: true });
	const now = new Date().toISOString();
	const oldCompanyFile = join(DATA_DIR, 'company.json');

	if (existsSync(oldCompanyFile)) {
		// Altbestand vorhanden: Namen lesen (Fallback), id bilden, Dateien verschieben.
		let name = 'Meine Firma';
		let industry: string | undefined;
		try {
			const raw = JSON.parse(readFileSync(oldCompanyFile, 'utf8'));
			if (raw?.name && String(raw.name).trim()) name = String(raw.name).trim();
			if (raw?.industry && String(raw.industry).trim()) industry = String(raw.industry).trim();
		} catch {
			// keep defaults; data file is moved untouched regardless of parse result
		}
		const id = newId(name, new Set());
		const dir = join(COMPANIES_DIR, id);
		mkdirSync(dir, { recursive: true });
		// Sekundärdateien zuerst, company.json zuletzt (kleineres Fenster bei Abbruch).
		for (const f of COMPANY_FILES) {
			if (f === 'company.json') continue;
			moveFile(join(DATA_DIR, f), join(dir, f));
		}
		moveFile(oldCompanyFile, join(dir, 'company.json'));
		// Registry zuletzt schreiben -> markiert die Migration als abgeschlossen.
		writeRegistry({ active: id, list: [{ id, name, industry, createdAt: now }] });
	} else {
		// Kein Altbestand: leere Default-Firma anlegen.
		const id = newId('Meine Firma', new Set());
		mkdirSync(join(COMPANIES_DIR, id), { recursive: true });
		writeRegistry({ active: id, list: [{ id, name: 'Meine Firma', createdAt: now }] });
	}
}

// Liefert eine garantiert gültige Registry (migriert bei Bedarf, repariert active/leere list).
function loadRegistry(): Registry {
	ensureMigrated();
	let reg = readRegistry();
	if (!reg || reg.list.length === 0) {
		// Defensive Reparatur: sollte nach ensureMigrated nicht eintreten.
		const id = newId('Meine Firma', new Set());
		mkdirSync(join(COMPANIES_DIR, id), { recursive: true });
		reg = { active: id, list: [{ id, name: 'Meine Firma', createdAt: new Date().toISOString() }] };
		writeRegistry(reg);
		return reg;
	}
	// active muss auf eine existierende Firma zeigen.
	if (!reg.list.some((c) => c.id === reg!.active)) {
		reg.active = reg.list[0].id;
		writeRegistry(reg);
	}
	return reg;
}

// ---------- public API ----------

export function listCompanies(): CompanyMeta[] {
	return loadRegistry().list;
}

// Garantiert eine gültige, existierende Firma-id (löst bei Bedarf die Migration aus).
export function getActiveId(): string {
	return loadRegistry().active;
}

// Schaltet die aktive Firma um (nur wenn die id existiert).
export function setActiveId(id: string): CompanyMeta | null {
	const reg = loadRegistry();
	const meta = reg.list.find((c) => c.id === id);
	if (!meta) return null;
	reg.active = id;
	writeRegistry(reg);
	return meta;
}

// Legt eine neue Firma an (Verzeichnis + Registry-Eintrag). Macht sie NICHT automatisch aktiv.
export function createCompany(input: { name: string; industry?: string }): CompanyMeta {
	const reg = loadRegistry();
	const name = (input.name ?? '').toString().trim() || 'Neue Firma';
	const industry = (input.industry ?? '').toString().trim() || undefined;
	const id = newId(name, new Set(reg.list.map((c) => c.id)));
	mkdirSync(join(COMPANIES_DIR, id), { recursive: true });
	const meta: CompanyMeta = { id, name, industry, createdAt: new Date().toISOString() };
	reg.list.push(meta);
	writeRegistry(reg);
	return meta;
}

// Benennt eine Firma um.
export function renameCompany(id: string, name: string): CompanyMeta | null {
	const reg = loadRegistry();
	const meta = reg.list.find((c) => c.id === id);
	if (!meta) return null;
	const next = (name ?? '').toString().trim();
	if (next) meta.name = next;
	writeRegistry(reg);
	return meta;
}

// Entfernt eine Firma SICHER: Verzeichnis nach data/companies/.trash/<id>-<ts> verschieben
// (kein hartes Löschen), aus der Liste nehmen. Nie die letzte Firma löschen; war sie aktiv,
// wird auf eine andere umgeschaltet.
export function removeCompany(id: string): CompanyMeta[] {
	const reg = loadRegistry();
	if (reg.list.length <= 1) return reg.list; // mind. eine Firma bleibt
	const idx = reg.list.findIndex((c) => c.id === id);
	if (idx === -1) return reg.list;

	const dir = join(COMPANIES_DIR, id);
	if (existsSync(dir)) {
		mkdirSync(TRASH_DIR, { recursive: true });
		const ts = new Date().toISOString().replace(/[:.]/g, '-');
		moveFile(dir, join(TRASH_DIR, `${id}-${ts}`));
	}
	reg.list.splice(idx, 1);
	if (reg.active === id) reg.active = reg.list[0].id;
	writeRegistry(reg);
	return reg.list;
}

// Verzeichnis der aktiven Firma (existiert garantiert). Basis für die file()-Pfade der Module.
export function companyDir(): string {
	const id = getActiveId();
	const dir = join(COMPANIES_DIR, id);
	mkdirSync(dir, { recursive: true });
	return dir;
}
