// Marketing-Modul: speichert je Werkzeug das letzte Ergebnis + kurzen Verlauf.
// Persistenz in data/marketing.json (mode 0o600), Muster wie company.ts/crm.ts.

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const FILE = 'data/marketing.json';

export type MarketingTool = 'content' | 'social' | 'ads' | 'campaign' | 'googleAds';
export const MARKETING_TOOLS: MarketingTool[] = ['content', 'social', 'ads', 'campaign', 'googleAds'];

export type MarketingEntry = {
	id: string;
	// Kurze, menschenlesbare Zusammenfassung der Eingabe (für den Verlauf).
	label: string;
	result: string;
	at: string;
	// Optionale strukturierte Nutzlast (z. B. die rohe Google-Ads-Kampagne als JSON, für den CSV-Export).
	data?: unknown;
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
	return { content: emptyTool(), social: emptyTool(), ads: emptyTool(), campaign: emptyTool(), googleAds: emptyTool() };
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
export function saveResult(tool: MarketingTool, label: string, result: string, data?: unknown): Marketing {
	const m = load();
	if (!MARKETING_TOOLS.includes(tool)) return m;
	const entry: MarketingEntry = {
		id: randomUUID(),
		label: (label ?? '').toString().trim().slice(0, 120),
		result: (result ?? '').toString(),
		at: new Date().toISOString(),
		...(data !== undefined ? { data } : {})
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

// ---------- Google-Ads-Kampagne ----------
// Strukturiertes Kampagnen-Modell (von der KI erzeugt, normalisiert gespeichert).
export type GoogleAdsMatchType = 'Broad' | 'Phrase' | 'Exact';
export type GoogleAdsKeyword = { text: string; matchType: GoogleAdsMatchType };
export type GoogleAdsAdGroup = {
	name: string;
	keywords: GoogleAdsKeyword[];
	headlines: string[]; // max 15, je ≤30 Zeichen
	descriptions: string[]; // max 4, je ≤90 Zeichen
	path1: string; // ≤15 Zeichen
	path2: string; // ≤15 Zeichen
};
export type GoogleAdsCampaign = {
	campaignName: string;
	budgetEUR: number;
	finalUrl: string;
	adGroups: GoogleAdsAdGroup[];
};

// Google-Ads-Editor-Spalten in exakt der vom Editor erwarteten Reihenfolge.
export const GOOGLE_ADS_CSV_COLUMNS: string[] = [
	'Campaign',
	'Campaign Type',
	'Networks',
	'Budget',
	'Languages',
	'Bid Strategy Type',
	'Ad Group',
	'Max CPC',
	...Array.from({ length: 15 }, (_, i) => `Headline ${i + 1}`),
	...Array.from({ length: 4 }, (_, i) => `Description ${i + 1}`),
	'Path 1',
	'Path 2',
	'Final URL',
	'Criterion Type',
	'Keyword',
	'Ad type',
	'Campaign Status',
	'Ad Group Status',
	'Status'
];

// Ein Feld für die TAB-getrennte CSV escapen (Google-Ads-Konvention: bei Tab/Zeilenumbruch/Quote
// in doppelte Anführungszeichen setzen, interne Quotes verdoppeln).
function csvField(value: unknown): string {
	const s = value == null ? '' : String(value);
	if (s === '') return '';
	if (s.includes('\t') || s.includes('\n') || s.includes('\r') || s.includes('"')) {
		return '"' + s.replace(/"/g, '""') + '"';
	}
	return s;
}

// Baut die TAB-getrennte CSV-Tabelle (als String) aus einer Kampagne.
// Zeilen: 1× Campaign + je AdGroup 1× RSA + je Keyword 1×. Spaltenreihenfolge = GOOGLE_ADS_CSV_COLUMNS.
export function buildGoogleAdsCsv(campaign: GoogleAdsCampaign): string {
	const cols = GOOGLE_ADS_CSV_COLUMNS;
	const rows: Record<string, string>[] = [];
	const name = (campaign.campaignName ?? '').toString();
	const url = (campaign.finalUrl ?? '').toString();
	const budget = Number.isFinite(campaign.budgetEUR) ? String(campaign.budgetEUR) : '';

	// (a) Campaign-Zeile
	rows.push({
		Campaign: name,
		'Campaign Type': 'Search',
		Networks: 'Google search',
		Budget: budget,
		Languages: 'de',
		'Bid Strategy Type': 'Manual CPC',
		'Campaign Status': 'Enabled'
	});

	for (const g of campaign.adGroups ?? []) {
		const gname = (g.name ?? '').toString();
		// (b) RSA-Zeile je Anzeigengruppe
		const adRow: Record<string, string> = {
			Campaign: name,
			'Ad Group': gname,
			'Path 1': (g.path1 ?? '').toString(),
			'Path 2': (g.path2 ?? '').toString(),
			'Final URL': url,
			'Ad type': 'Responsive search ad',
			Status: 'Enabled'
		};
		(g.headlines ?? []).slice(0, 15).forEach((h, i) => {
			adRow[`Headline ${i + 1}`] = (h ?? '').toString();
		});
		(g.descriptions ?? []).slice(0, 4).forEach((d, i) => {
			adRow[`Description ${i + 1}`] = (d ?? '').toString();
		});
		rows.push(adRow);

		// (c) Keyword-Zeilen
		for (const k of g.keywords ?? []) {
			rows.push({
				Campaign: name,
				'Ad Group': gname,
				Keyword: (k.text ?? '').toString(),
				'Criterion Type': (k.matchType ?? '').toString(),
				Status: 'Enabled'
			});
		}
	}

	const headerLine = cols.map(csvField).join('\t');
	const bodyLines = rows.map((r) => cols.map((c) => csvField(r[c] ?? '')).join('\t'));
	return [headerLine, ...bodyLines].join('\n');
}

// CSV-Text in UTF-16 LE mit BOM (0xFF 0xFE) kodieren — wie der Google-Ads-Editor exportiert.
export function googleAdsCsvBuffer(csvText: string): Buffer {
	const bom = Buffer.from([0xff, 0xfe]);
	const body = Buffer.from(csvText, 'utf16le');
	return Buffer.concat([bom, body]);
}
