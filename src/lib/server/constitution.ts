// Constitution — die Sicherheits-Verfassung des Selbst-Erweiterungs-Systems.
// GLOBAL (systemweit, nicht pro Firma) und bewusst READ-ONLY für die KI:
// Der Kurator-Code liest hier nur; geändert wird die Policy ausschließlich durch
// den Operator (Datei oder session-geschützte API). So kann die KI ihre eigenen
// Leitplanken nicht aufweichen (Schutz gegen Objective-Hacking).

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const DATA_DIR = 'data';
const FILE = join(DATA_DIR, 'constitution.json');

export type Constitution = {
	version: number;
	/** Not-Aus: false = der Autopoiesis-Loop ist gestoppt, es entstehen keine neuen Vorschläge. */
	loopEnabled: boolean;
	/** Immer true: nichts Ausführbares wird ohne ausdrücklichen Operator-Klick installiert. */
	requireApproval: boolean;
	budgets: {
		/** Max. neue Vorschläge pro Kalendertag. */
		proposalsPerDay: number;
		/** Max. Entwicklungs-VERSUCHE pro Kalendertag (auch fehlgeschlagene zählen — Cost-Deckel). */
		attemptsPerDay: number;
		/** Obergrenze selbst-installierter Add-ons. */
		maxAddons: number;
		/** Harte Laufzeitgrenze für den Sandbox-Test eines Vorschlags (ms). */
		sandboxTimeoutMs: number;
	};
	/** Ziel-Domains, die generierter Code erreichen darf ([] = keine zusätzliche Einschränkung
	 *  über den SSRF-Schutz der Sandbox hinaus). Nur dokumentierend/informativ in Phase 1. */
	egressWhitelist: string[];
	/** Harte Verbote (nur Dokumentation für Operator + Prompt-Kontext). */
	forbidden: string[];
};

export const DEFAULT_CONSTITUTION: Constitution = {
	version: 1,
	loopEnabled: true,
	requireApproval: true,
	budgets: { proposalsPerDay: 5, attemptsPerDay: 20, maxAddons: 100, sandboxTimeoutMs: 5000 },
	egressWhitelist: [],
	forbidden: [
		'.env-Dateien oder Geheimnisse lesen/ausgeben',
		'Zugriff auf interne/private Netz-Adressen',
		'Kern-Module (curator, sandbox, plugins, audit, constitution) verändern',
		'Installation ohne ausdrückliche Operator-Freigabe'
	]
};

// Merged Persistenz mit den Defaults (fehlende Felder werden ergänzt, requireApproval bleibt hart true).
function load(): Constitution {
	if (!existsSync(FILE)) return { ...DEFAULT_CONSTITUTION };
	try {
		const raw = JSON.parse(readFileSync(FILE, 'utf8')) as Partial<Constitution>;
		return {
			...DEFAULT_CONSTITUTION,
			...raw,
			budgets: { ...DEFAULT_CONSTITUTION.budgets, ...(raw.budgets ?? {}) },
			egressWhitelist: Array.isArray(raw.egressWhitelist) ? raw.egressWhitelist.map(String) : [],
			forbidden: Array.isArray(raw.forbidden) ? raw.forbidden.map(String) : DEFAULT_CONSTITUTION.forbidden,
			// Approval-Pflicht ist nicht abschaltbar.
			requireApproval: true
		};
	} catch {
		return { ...DEFAULT_CONSTITUTION };
	}
}

function save(c: Constitution) {
	mkdirSync(DATA_DIR, { recursive: true });
	writeFileSync(FILE, JSON.stringify(c, null, 2), { mode: 0o600 });
}

export function getConstitution(): Constitution {
	return load();
}

export function isLoopEnabled(): boolean {
	return load().loopEnabled;
}

// Not-Aus umlegen. NUR vom session-geschützten API-Handler aufgerufen — nie vom Kurator-Code.
export function setLoopEnabled(enabled: boolean): Constitution {
	const c = load();
	c.loopEnabled = Boolean(enabled);
	save(c);
	return c;
}
