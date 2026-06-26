import { json } from '@sveltejs/kit';
import { getCompany, MEMORY_CATEGORIES, type Company, type MemoryCategory } from '$lib/server/company';
import { getCrm } from '$lib/server/crm';
import { engineChat } from '$lib/server/engine';
import { getMarketing, saveResult, clearTool, MARKETING_TOOLS, type MarketingTool } from '$lib/server/marketing';

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

export async function GET() {
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

	// ---------- Verwaltung ----------
	if (action === 'clear') {
		const tool = (b.tool ?? '').toString() as MarketingTool;
		if (!MARKETING_TOOLS.includes(tool)) return json({ ok: false, message: 'Unbekanntes Werkzeug.' }, { status: 400 });
		return json({ ok: true, marketing: clearTool(tool) });
	}

	return json({ ok: false, message: 'Unbekannte Aktion.' }, { status: 400 });
}
