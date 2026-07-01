// Proposal-Store — Vorschläge des Kurators, pro Firma.
// Ein Proposal ist eine vorgeschlagene, aber NOCH NICHT installierte Erweiterung:
// die erkannte Fähigkeits-Lücke, das generierte Code-Add-on und das Ergebnis des
// Sandbox-Tests + der Verifikation. Installiert wird erst nach Operator-Freigabe.
// Speicher: data/companies/<id>/proposals.json.

import { existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { companyDir } from './companies';
import type { GeneratedAddon } from './addonGen';

export type ProposalRisk = 'niedrig' | 'mittel' | 'hoch';
export type ProposalStatus =
	| 'vorgeschlagen'
	| 'genehmigt'
	| 'abgelehnt'
	| 'installiert'
	| 'zurückgerollt';

export type ProposalTest = {
	ok: boolean;
	output?: unknown;
	error?: string;
	/** Urteil des getrennten Prüfers (nicht des Generators). */
	verifierVerdict?: 'ok' | 'mangelhaft';
	verifierReason?: string;
};

export type Proposal = {
	id: string;
	/** Bezug zum Ziel, dem der Vorschlag dient. */
	goalId?: string;
	goalTitle?: string;
	/** Kurzbeschreibung der erkannten Lücke. */
	gap: string;
	title: string;
	rationale: string;
	risk: ProposalRisk;
	addon: GeneratedAddon;
	test: ProposalTest;
	status: ProposalStatus;
	/** Vorgänger-Proposal-ids (Archiv/Lineage), z. B. bei erneutem Anlauf. */
	lineage: string[];
	createdAt: string;
	decidedAt?: string;
	decidedBy?: string;
	reason?: string;
};

const VALID_STATUS: ProposalStatus[] = ['vorgeschlagen', 'genehmigt', 'abgelehnt', 'installiert', 'zurückgerollt'];

function file(): string {
	return join(companyDir(), 'proposals.json');
}

function load(): Proposal[] {
	const f = file();
	if (!existsSync(f)) return [];
	try {
		const raw = JSON.parse(readFileSync(f, 'utf8'));
		return Array.isArray(raw) ? raw : [];
	} catch {
		return [];
	}
}

function save(list: Proposal[]) {
	// Atomar schreiben (temp + rename): verhindert Teilschreiben/Verlust bei nebenläufigen Writes.
	const f = file();
	const tmp = f + '.tmp';
	writeFileSync(tmp, JSON.stringify(list, null, 2), { mode: 0o600 });
	renameSync(tmp, f);
}

export function listProposals(): Proposal[] {
	// Neueste zuerst.
	return load().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export function getProposal(id: string): Proposal | null {
	return load().find((p) => p.id === id) ?? null;
}

// Zählt Vorschläge, die am heutigen Kalendertag (lokal) erzeugt wurden — für das Tagesbudget.
export function countProposalsToday(): number {
	const today = new Date().toDateString();
	return load().filter((p) => {
		try { return new Date(p.createdAt).toDateString() === today; } catch { return false; }
	}).length;
}

export function addProposal(input: Omit<Proposal, 'id' | 'status' | 'lineage' | 'createdAt'> & { lineage?: string[] }): Proposal {
	const list = load();
	const p: Proposal = {
		...input,
		id: randomUUID(),
		status: 'vorgeschlagen',
		lineage: Array.isArray(input.lineage) ? input.lineage : [],
		createdAt: new Date().toISOString()
	};
	list.push(p);
	save(list);
	return p;
}

export function setProposalStatus(
	id: string,
	status: ProposalStatus,
	meta?: { decidedBy?: string; reason?: string }
): Proposal | null {
	if (!VALID_STATUS.includes(status)) return null;
	const list = load();
	const p = list.find((x) => x.id === id);
	if (!p) return null;
	p.status = status;
	p.decidedAt = new Date().toISOString();
	if (meta?.decidedBy) p.decidedBy = meta.decidedBy;
	if (typeof meta?.reason === 'string') p.reason = meta.reason.trim() || undefined;
	save(list);
	return p;
}

// Setzt die tatsächlich installierte Add-on-id (falls sie zur Kollisionsvermeidung
// beim Installieren abweicht) — damit der spätere Rollback das richtige Add-on trifft.
export function setProposalAddonId(id: string, addonId: string): boolean {
	const list = load();
	const p = list.find((x) => x.id === id);
	if (!p) return false;
	p.addon = { ...p.addon, id: addonId };
	save(list);
	return true;
}

export function removeProposal(id: string): boolean {
	const list = load();
	const next = list.filter((p) => p.id !== id);
	if (next.length === list.length) return false;
	save(next);
	return true;
}

// Alle vom Kurator installierten Add-on-ids (für Not-Aus: gezieltes Deaktivieren).
export function installedAddonIds(): string[] {
	return load().filter((p) => p.status === 'installiert').map((p) => p.addon.id);
}
