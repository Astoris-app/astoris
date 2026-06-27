import { json } from '@sveltejs/kit';
import { getCompany, MEMORY_CATEGORIES, type Company, type MemoryCategory } from '$lib/server/company';
import { getCrm } from '$lib/server/crm';
import { engineChat } from '$lib/server/engine';
import {
	getMarketing,
	saveResult,
	clearTool,
	buildGoogleAdsCsv,
	googleAdsCsvBuffer,
	MARKETING_TOOLS,
	type MarketingTool,
	type GoogleAdsCampaign,
	type GoogleAdsAdGroup,
	type GoogleAdsMatchType
} from '$lib/server/marketing';

// Überschriften je relevanter Memory-Kategorie für den Marketing-Kontext.
const MEMORY_HEADINGS: Record<MemoryCategory, string> = {
	firma: 'Firmen-Wissen',
	produkt: 'Produkt-Wissen',
	kunde: 'Über unsere Kunden/Zielgruppe',
	marke: 'Marken-Stimme/Tonalität (verbindlich einhalten)',
	entscheidung: 'Frühere Entscheidungen',
	'nicht-tun': 'NICHT tun (Tabus, strikt beachten)',
	experiment: 'Experimente & Ergebnisse'
};

// Welche Kategorien fürs Marketing wirklich relevant sind (kompakt halten).
const RELEVANT_CATEGORIES: MemoryCategory[] = ['marke', 'produkt', 'kunde', 'firma', 'nicht-tun'];

const MEMORY_MAX_PER_CAT = 6;
const MEMORY_CONTENT_MAX = 400;
const PRODUCTS_MAX = 12;

// Baut den Memory-Block (nur marketing-relevante, nicht-leere Kategorien).
function memoryBlock(c: Company): string {
	const mem = Array.isArray(c.memory) ? c.memory : [];
	if (!mem.length) return '';
	const parts: string[] = [];
	for (const cat of RELEVANT_CATEGORIES) {
		if (!MEMORY_CATEGORIES.includes(cat)) continue;
		const entries = mem
			.filter((m) => m.category === cat && (m.title?.trim() || m.content?.trim()))
			.slice(0, MEMORY_MAX_PER_CAT);
		if (!entries.length) continue;
		const lines = entries.map((m) => {
			const title = (m.title ?? '').trim();
			const content = (m.content ?? '').trim().slice(0, MEMORY_CONTENT_MAX);
			if (title && content) return `- ${title}: ${content}`;
			return '- ' + (title || content);
		});
		parts.push(MEMORY_HEADINGS[cat] + ':\n' + lines.join('\n'));
	}
	return parts.join('\n\n');
}

// Baut einen kompakten Produkt-Block aus dem CRM (als Marketing-Kontext nutzbar).
function productBlock(): string {
	const crm = getCrm();
	const products = (crm.products ?? []).slice(0, PRODUCTS_MAX);
	if (!products.length) return '';
	const lines = products.map((p) => {
		const price = p.price != null && Number.isFinite(p.price) ? ` (${p.price}${p.currency ? ' ' + p.currency : ''})` : '';
		const desc = p.description?.trim() ? ' — ' + p.description.trim().slice(0, 200) : '';
		return `- ${p.name}${price}${desc}`;
	});
	return 'Produkte/Leistungen (aus dem CRM):\n' + lines.join('\n');
}

// Gemeinsamer Firmen-Kontext für alle Marketing-Werkzeuge.
function companyContext(c: Company): string {
	return [
		c.name ? 'Firma: ' + c.name : '',
		c.mission ? 'Mission: ' + c.mission : '',
		memoryBlock(c),
		productBlock(),
		c.knowledge ? 'Allgemeines Wissen über die Firma (berücksichtigen):\n' + c.knowledge : ''
	]
		.filter(Boolean)
		.join('\n\n');
}

// Basis-Rolle: KI ist Marketing-Stratege/Texter der Firma.
function baseRole(c: Company): string {
	return (
		`Du bist erfahrene:r Marketing-Stratege:in und Texter:in${c.name ? ' für ' + c.name : ''}. ` +
		'Schreibe konkret, wirkungsvoll und im Ton der Marke. Erfinde keine Fakten, Zahlen oder Eigenschaften, die nicht aus dem Kontext stammen. ' +
		'Antworte auf Deutsch (außer ein Plattform-Ton verlangt etwas anderes) und nutze Markdown.'
	);
}

const SOCIAL_PLATFORMS = ['linkedin', 'x', 'instagram'] as const;
const ADS_PLATFORMS = ['google', 'meta'] as const;

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
	const v = (value ?? '').toString().toLowerCase().trim();
	return (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}

function str(v: unknown): string {
	return (v ?? '').toString().trim();
}

// Führt einen Marketing-Auftrag aus: System-Prompt mit Firmen-Kontext + engineChat.
// Skip-on-fail: source 'demo' = keine KI verbunden → ok:false mit klarer Meldung, nichts gespeichert.
async function run(tool: MarketingTool, instruction: string, userPrompt: string, label: string) {
	const c = getCompany();
	const system = [baseRole(c), companyContext(c), instruction].filter(Boolean).join('\n\n');
	const res = await engineChat([
		{ role: 'system', content: system },
		{ role: 'user', content: userPrompt }
	]);
	if (res.source === 'demo') {
		// Keine KI verbunden oder Engine nicht erreichbar → klare Meldung, nicht speichern.
		return json({ ok: false, message: res.reply });
	}
	const marketing = saveResult(tool, label, res.reply);
	return json({ ok: true, result: res.reply, source: res.source, marketing });
}

// ---------- Google-Ads-Kampagne: Parsing/Normalisierung ----------
const MATCH_TYPES: GoogleAdsMatchType[] = ['Broad', 'Phrase', 'Exact'];

// Extrahiert das erste JSON-Objekt aus einer KI-Antwort (entfernt ```json-Codeblöcke,
// schneidet auf das äußerste { … } zu). Wirft bei Misserfolg.
function parseCampaignJson(raw: string): unknown {
	let t = (raw ?? '').toString().trim();
	// ```json … ``` oder ``` … ``` Codeblöcke entfernen.
	const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
	if (fence) t = fence[1].trim();
	// Auf das äußerste Objekt zuschneiden.
	const start = t.indexOf('{');
	const end = t.lastIndexOf('}');
	if (start === -1 || end === -1 || end <= start) throw new Error('no json object');
	return JSON.parse(t.slice(start, end + 1));
}

function matchType(v: unknown): GoogleAdsMatchType {
	const s = (v ?? '').toString().trim().toLowerCase();
	if (s.startsWith('exact') || s === '[]' || s.includes('exakt')) return 'Exact';
	if (s.startsWith('phrase') || s.includes('passend')) return 'Phrase';
	return 'Broad';
}

function clampStr(v: unknown, max: number): string {
	return (v ?? '').toString().replace(/\s+/g, ' ').trim().slice(0, max);
}

// Bringt das rohe KI-JSON in ein sauberes, sicheres Kampagnen-Modell (mit Limits).
function normalizeCampaign(raw: unknown, finalUrl: string, budgetFallback: number): GoogleAdsCampaign {
	const o = (raw ?? {}) as Record<string, unknown>;
	const budgetRaw = Number(o.budgetEUR);
	const budgetEUR = Number.isFinite(budgetRaw) && budgetRaw > 0 ? Math.round(budgetRaw * 100) / 100 : budgetFallback;
	const groupsRaw = Array.isArray(o.adGroups) ? o.adGroups : [];
	const adGroups: GoogleAdsAdGroup[] = groupsRaw.slice(0, 20).map((gr, gi) => {
		const g = (gr ?? {}) as Record<string, unknown>;
		const kwRaw = Array.isArray(g.keywords) ? g.keywords : [];
		const keywords = kwRaw
			.map((kr) => {
				const k = (kr ?? {}) as Record<string, unknown>;
				// Keyword kann String oder { text, matchType } sein.
				const text = typeof kr === 'string' ? clampStr(kr, 80) : clampStr(k.text, 80);
				return { text, matchType: matchType(typeof kr === 'string' ? 'Broad' : k.matchType) };
			})
			.filter((k) => k.text)
			.slice(0, 40);
		const headlines = (Array.isArray(g.headlines) ? g.headlines : [])
			.map((h) => clampStr(h, 30))
			.filter(Boolean)
			.slice(0, 15);
		const descriptions = (Array.isArray(g.descriptions) ? g.descriptions : [])
			.map((d) => clampStr(d, 90))
			.filter(Boolean)
			.slice(0, 4);
		return {
			name: clampStr(g.name, 80) || `Anzeigengruppe ${gi + 1}`,
			keywords,
			headlines,
			descriptions,
			path1: clampStr(g.path1, 15),
			path2: clampStr(g.path2, 15)
		};
	});
	return {
		campaignName: clampStr(o.campaignName, 120) || 'Astoris-Kampagne',
		budgetEUR,
		finalUrl,
		adGroups
	};
}

// Menschenlesbarer Gesamttext (für Anzeige-Fallback + Kopier-Button).
function campaignToText(c: GoogleAdsCampaign): string {
	const lines: string[] = [];
	lines.push(`# ${c.campaignName}`);
	lines.push(`Tagesbudget: ${c.budgetEUR} EUR · Final URL: ${c.finalUrl}`);
	lines.push('');
	c.adGroups.forEach((g, gi) => {
		lines.push(`## ${gi + 1}. ${g.name}`);
		if (g.keywords.length) {
			lines.push('Keywords:');
			for (const k of g.keywords) lines.push(`- ${k.text} [${k.matchType}]`);
		}
		if (g.headlines.length) {
			lines.push('Headlines:');
			g.headlines.forEach((h, i) => lines.push(`${i + 1}. ${h}`));
		}
		if (g.descriptions.length) {
			lines.push('Descriptions:');
			g.descriptions.forEach((d, i) => lines.push(`${i + 1}. ${d}`));
		}
		if (g.path1 || g.path2) lines.push(`Pfad: /${g.path1}${g.path2 ? '/' + g.path2 : ''}`);
		lines.push('');
	});
	return lines.join('\n').trim();
}

// Liefert die zuletzt gespeicherte Kampagne (für den CSV-Export).
function lastCampaign(): GoogleAdsCampaign | null {
	const data = getMarketing().googleAds?.last?.data;
	if (data && typeof data === 'object' && Array.isArray((data as GoogleAdsCampaign).adGroups)) {
		return data as GoogleAdsCampaign;
	}
	return null;
}

// Baut die CSV-Datei-Response (UTF-16 LE + BOM, TAB-getrennt).
function csvResponse(c: GoogleAdsCampaign): Response {
	const buf = googleAdsCsvBuffer(buildGoogleAdsCsv(c));
	// In eine frische, ArrayBuffer-gestützte Uint8Array kopieren (Response akzeptiert kein Node-Buffer-Typ).
	const body = new Uint8Array(buf.byteLength);
	body.set(buf);
	return new Response(body, {
		headers: {
			'content-type': 'text/csv; charset=utf-16le',
			'content-disposition': 'attachment; filename="astoris-kampagne.csv"',
			'cache-control': 'no-store'
		}
	});
}

export async function GET({ url }) {
	// Direkt-Download der zuletzt erzeugten Kampagne als Google-Ads-Editor-CSV.
	if (url.searchParams.get('action') === 'google-ads-csv') {
		const c = lastCampaign();
		if (!c) return json({ ok: false, message: 'Keine Kampagne gespeichert.' }, { status: 404 });
		return csvResponse(c);
	}
	return json({ marketing: getMarketing() });
}

export async function POST({ request }) {
	const b = await request.json().catch(() => ({}));
	const action = b?.action;

	// ---------- Content-Ideen ----------
	if (action === 'generate-content') {
		const topic = str(b.topic);
		if (!topic) return json({ ok: false, message: 'Bitte ein Thema oder einen Anlass angeben.' }, { status: 400 });
		const instruction =
			'Aufgabe: Entwickle 5–8 konkrete Content-Ideen zum gegebenen Thema/Anlass. ' +
			'Jede Idee als kurze Überschrift + ein Satz, was sie zeigt und warum sie zur Zielgruppe passt. ' +
			'Variiere Formate (Post, Story, Artikel, Video, Karussell …). Gib das Ergebnis als nummerierte Markdown-Liste aus.';
		const userPrompt = `Thema/Anlass: ${topic}`;
		return run('content', instruction, userPrompt, topic);
	}

	// ---------- Social-Post ----------
	if (action === 'generate-social') {
		const topic = str(b.topic);
		if (!topic) return json({ ok: false, message: 'Bitte ein Thema angeben.' }, { status: 400 });
		const platform = pick(b.platform, SOCIAL_PLATFORMS, 'linkedin');
		const platformHint: Record<(typeof SOCIAL_PLATFORMS)[number], string> = {
			linkedin: 'Plattform LinkedIn: professionell, mehrwertorientiert, 3–6 kurze Absätze, dezente Emojis erlaubt, 3–5 passende Hashtags am Ende.',
			x: 'Plattform X (Twitter): knackig, max ~280 Zeichen, ein starker Hook, 1–2 Hashtags.',
			instagram: 'Plattform Instagram: bildbezogene, nahbare Caption, klare Zeilenumbrüche, Emojis, 5–10 Hashtags am Ende.'
		};
		const instruction =
			'Aufgabe: Schreibe EINEN fertigen, sofort verwendbaren Social-Media-Post im Markenton. ' +
			platformHint[platform] +
			' Beginne mit einem starken Hook und schließe mit einem klaren Call-to-Action.';
		const userPrompt = `Thema: ${topic}\nPlattform: ${platform}`;
		return run('social', instruction, userPrompt, `${topic} · ${platform}`);
	}

	// ---------- Ads-Text ----------
	if (action === 'generate-ads') {
		const offer = str(b.offer);
		if (!offer) return json({ ok: false, message: 'Bitte ein Produkt oder Angebot angeben.' }, { status: 400 });
		const platform = pick(b.platform, ADS_PLATFORMS, 'google');
		const platformHint: Record<(typeof ADS_PLATFORMS)[number], string> = {
			google:
				'Plattform Google Ads: je Variante eine Headline (max ~30 Zeichen) und ein Beschreibungstext (max ~90 Zeichen). Sachlich, keyword-nah, mit klarem Nutzen.',
			meta: 'Plattform Meta (Facebook/Instagram Ads): je Variante eine kurze, scroll-stoppende Headline und ein Primärtext (2–4 Sätze) mit Nutzen und CTA.'
		};
		const instruction =
			'Aufgabe: Erstelle 2–3 unterschiedliche Anzeigen-Varianten für das Produkt/Angebot. ' +
			platformHint[platform] +
			' Gib jede Variante als Markdown-Abschnitt aus: **Variante N** mit „Headline:" und „Text:". Betone echte Vorteile, kein leeres Werbe-Blabla.';
		const userPrompt = `Produkt/Angebot: ${offer}\nPlattform: ${platform}`;
		return run('ads', instruction, userPrompt, `${offer} · ${platform}`);
	}

	// ---------- Kampagnenplan ----------
	if (action === 'generate-campaign') {
		const goal = str(b.goal);
		if (!goal) return json({ ok: false, message: 'Bitte ein Ziel oder einen Anlass angeben.' }, { status: 400 });
		const instruction =
			'Aufgabe: Erstelle einen kompakten, umsetzbaren Kampagnenplan. Struktur als Markdown mit Abschnitten: ' +
			'**Kernbotschaft**, **Zielgruppe**, **Kanäle** (welche und warum), **Maßnahmen/Schritte** (nummeriert, mit grobem Zeitrahmen), **Erfolgsmessung** (1–3 KPIs). ' +
			'Halte es realistisch für eine kleine Firma und konkret genug, um sofort zu starten.';
		const userPrompt = `Ziel/Anlass der Kampagne: ${goal}`;
		return run('campaign', instruction, userPrompt, goal);
	}

	// ---------- Google-Ads-Kampagne (strukturiert + CSV-Export) ----------
	if (action === 'generate-google-ads') {
		const offer = str(b.offer);
		const finalUrl = str(b.finalUrl);
		if (!offer) return json({ ok: false, message: 'Bitte ein Produkt oder Angebot angeben.' }, { status: 400 });
		if (!/^https?:\/\//i.test(finalUrl)) return json({ ok: false, message: 'Bitte eine gültige Final URL (mit http:// oder https://) angeben.' }, { status: 400 });
		const budgetIn = Number(b.budget);
		const budgetFallback = Number.isFinite(budgetIn) && budgetIn > 0 ? Math.round(budgetIn * 100) / 100 : 10;
		const c = getCompany();
		const instruction =
			'Aufgabe: Entwirf eine vollständige Google-Search-Kampagne für das gegebene Produkt/Angebot. ' +
			'Antworte AUSSCHLIESSLICH mit einem einzigen gültigen JSON-Objekt (kein Markdown, kein Fließtext davor/danach) in genau dieser Form:\n' +
			'{ "campaignName": string, "budgetEUR": number, "adGroups": [ { "name": string, ' +
			'"keywords": [ { "text": string, "matchType": "Broad"|"Phrase"|"Exact" } ], ' +
			'"headlines": [string], "descriptions": [string], "path1": string, "path2": string } ] }\n' +
			'Regeln: 2–4 thematisch klar getrennte Anzeigengruppen. Je Gruppe 5–12 Keywords (gemischte matchTypes), ' +
			'max. 15 Headlines (JEDE ≤30 Zeichen), max. 4 Descriptions (JEDE ≤90 Zeichen), path1/path2 je ≤15 Zeichen (URL-Pfad-Anzeigetext, keine Leerzeichen). ' +
			'Deutsche Anzeigentexte im Markenton, konkret und nutzenorientiert, keine erfundenen Fakten. ' +
			`budgetEUR ist das Tagesbudget in EUR (nutze ${budgetFallback}, falls nicht anders sinnvoll).`;
		const userPrompt = `Produkt/Angebot: ${offer}\nFinal URL: ${finalUrl}\nGewünschtes Tagesbudget (EUR): ${budgetFallback}`;
		const system = [baseRole(c), companyContext(c), instruction].filter(Boolean).join('\n\n');
		// Lokale Modelle liefern JSON nicht immer sauber → bis zu 2 Versuche.
		let campaign: GoogleAdsCampaign | null = null;
		let lastSource = 'demo';
		for (let attempt = 0; attempt < 2 && !campaign; attempt++) {
			const res = await engineChat([
				{ role: 'system', content: system },
				{ role: 'user', content: userPrompt }
			]);
			lastSource = res.source;
			if (res.source === 'demo') return json({ ok: false, message: res.reply });
			try {
				const parsed = normalizeCampaign(parseCampaignJson(res.reply), finalUrl, budgetFallback);
				if (parsed.adGroups.length) campaign = parsed;
			} catch {
				/* nächster Versuch */
			}
		}
		if (!campaign) {
			return json({ ok: false, message: 'Die KI hat kein gültiges Kampagnen-JSON geliefert. Bitte erneut versuchen.' }, { status: 502 });
		}
		const text = campaignToText(campaign);
		const marketing = saveResult('googleAds', `${offer}`.slice(0, 80), text, campaign);
		return json({ ok: true, result: text, campaign, source: lastSource, marketing });
	}

	// CSV-Export per POST (z. B. für eine direkt mitgesendete Kampagne, sonst die gespeicherte).
	if (action === 'google-ads-csv') {
		let c: GoogleAdsCampaign | null = null;
		if (b.campaign && typeof b.campaign === 'object' && Array.isArray(b.campaign.adGroups)) {
			c = normalizeCampaign(b.campaign, str(b.campaign.finalUrl), Number(b.campaign.budgetEUR) || 10);
		} else {
			c = lastCampaign();
		}
		if (!c) return json({ ok: false, message: 'Keine Kampagne gespeichert.' }, { status: 404 });
		return csvResponse(c);
	}

	// ---------- Verwaltung ----------
	if (action === 'clear') {
		const tool = (b.tool ?? '').toString() as MarketingTool;
		if (!MARKETING_TOOLS.includes(tool)) return json({ ok: false, message: 'Unbekanntes Werkzeug.' }, { status: 400 });
		return json({ ok: true, marketing: clearTool(tool) });
	}

	return json({ ok: false, message: 'Unbekannte Aktion.' }, { status: 400 });
}
