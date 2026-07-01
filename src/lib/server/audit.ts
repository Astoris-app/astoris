// Audit-Log — append-only Protokoll aller sicherheitsrelevanten Aktionen des
// Selbst-Erweiterungs-Systems (Vorschlag erzeugt, genehmigt, abgelehnt, installiert,
// zurückgerollt, Not-Aus). GLOBAL. Bewusst JSONL + append-only, damit die Spur
// nachvollziehbar bleibt und nicht still überschrieben werden kann.

import { existsSync, appendFileSync, readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const DATA_DIR = 'data';
const FILE = join(DATA_DIR, 'audit.log');

export type AuditAction =
	| 'proposal-created'
	| 'proposal-approved'
	| 'proposal-rejected'
	| 'proposal-installed'
	| 'proposal-rolled-back'
	| 'loop-stopped'
	| 'loop-resumed'
	| 'emergency-stop';

export type AuditEntry = {
	at: string;
	action: AuditAction;
	/** Wer die Aktion ausgelöst hat: 'kurator' (KI) oder Operator-Name. */
	actor: string;
	/** Firma-Kontext, sofern zutreffend. */
	companyId?: string;
	/** Betroffenes Objekt (Proposal-/Add-on-id). */
	targetId?: string;
	detail?: string;
	result?: string;
};

// Schreibt einen Eintrag ans Ende. Skip-on-fail: darf den Hauptfluss nie brechen.
export function appendAudit(entry: Omit<AuditEntry, 'at'>): void {
	try {
		mkdirSync(DATA_DIR, { recursive: true });
		const full: AuditEntry = { at: new Date().toISOString(), ...entry };
		appendFileSync(FILE, JSON.stringify(full) + '\n', { mode: 0o600 });
	} catch {
		/* Audit-Schreiben darf den Hauptfluss nie unterbrechen. */
	}
}

// Liest die letzten `limit` Einträge (neueste zuerst). Defekte Zeilen werden übersprungen.
export function listAudit(limit = 100): AuditEntry[] {
	if (!existsSync(FILE)) return [];
	try {
		const lines = readFileSync(FILE, 'utf8').split('\n').filter((l) => l.trim());
		const out: AuditEntry[] = [];
		for (const l of lines.slice(-limit)) {
			try { out.push(JSON.parse(l)); } catch { /* defekte Zeile überspringen */ }
		}
		return out.reverse();
	} catch {
		return [];
	}
}
