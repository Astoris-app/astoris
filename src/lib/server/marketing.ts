// Marketing-Modul: speichert je Werkzeug das letzte Ergebnis + kurzen Verlauf.
// Persistenz in data/marketing.json (mode 0o600), Muster wie company.ts/crm.ts.

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const FILE = 'data/marketing.json';

export type MarketingTool = 'content' | 'social' | 'ads' | 'campaign';
export const MARKETING_TOOLS: MarketingTool[] = ['content', 'social', 'ads', 'campaign'];

export type MarketingEntry = {
	id: string;
	// Kurze, menschenlesbare Zusammenfassung der Eingabe (für den Verlauf).
	label: string;
	result: string;
	at: string;
};

// Je Werkzeug: das letzte Ergebnis + ein kurzer Verlauf (neueste zuerst).
export type ToolState = {
	last: MarketingEntry | null;
	history: MarketingEntry[];
};

export type Marketing = Record<MarketingTool, ToolState>;

const HISTORY_MAX = 5;

function emptyTool(): ToolState {
	return { last: null, history: [] };
}
function empty(): Marketing {
	return { content: emptyTool(), social: emptyTool(), ads: emptyTool(), campaign: emptyTool() };
}

function load(): Marketing {
	const base = empty();
	if (!existsSync(FILE)) return base;
	try {
		const raw = JSON.parse(readFileSync(FILE, 'utf8'));
		for (const tool of MARKETING_TOOLS) {
			const t = raw?.[tool];
			if (t && typeof t === 'object') {
				base[tool] = {
					last: t.last && typeof t.last === 'object' ? (t.last as MarketingEntry) : null,
					history: Array.isArray(t.history) ? (t.history as MarketingEntry[]).slice(0, HISTORY_MAX) : []
				};
			}
		}
		return base;
	} catch {
		return base;
	}
}

function save(m: Marketing) {
	mkdirSync('data', { recursive: true });
	writeFileSync(FILE, JSON.stringify(m, null, 2), { mode: 0o600 });
}

export function getMarketing(): Marketing {
	return load();
}

// Speichert ein neues Ergebnis als „letztes" und schiebt das vorherige in den Verlauf.
export function saveResult(tool: MarketingTool, label: string, result: string): Marketing {
	const m = load();
	if (!MARKETING_TOOLS.includes(tool)) return m;
	const entry: MarketingEntry = {
		id: randomUUID(),
		label: (label ?? '').toString().trim().slice(0, 120),
		result: (result ?? '').toString(),
		at: new Date().toISOString()
	};
	const state = m[tool] ?? emptyTool();
	// Vorheriges „letztes" wandert in den Verlauf (neueste zuerst, gedeckelt).
	const prev = state.last;
	const history = prev ? [prev, ...state.history].slice(0, HISTORY_MAX) : state.history.slice(0, HISTORY_MAX);
	m[tool] = { last: entry, history };
	save(m);
	return m;
}

// Leert ein einzelnes Werkzeug (letztes Ergebnis + Verlauf).
export function clearTool(tool: MarketingTool): Marketing {
	const m = load();
	if (MARKETING_TOOLS.includes(tool)) m[tool] = emptyTool();
	save(m);
	return m;
}
