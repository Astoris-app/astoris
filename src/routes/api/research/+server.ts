import { json } from '@sveltejs/kit';
import { upsertSearch } from '$lib/server/research-history';

type Result = { title: string; url: string; snippet: string };

// Strip HTML tags and decode common entities for clean text output.
function clean(html: string): string {
	return html
		.replace(/<[^>]*>/g, '')
		.replace(/&amp;/g, '&')
		.replace(/&quot;/g, '"')
		.replace(/&#x27;/g, "'")
		.replace(/&#39;/g, "'")
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&nbsp;/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

// DuckDuckGo wraps result links in a redirect (…/l/?uddg=<encoded target>).
// Decode them back to the real destination so links and domains are honest.
function resolveUrl(href: string): string {
	let u = href.trim();
	if (u.startsWith('//')) u = 'https:' + u;
	try {
		const parsed = new URL(u, 'https://duckduckgo.com');
		const uddg = parsed.searchParams.get('uddg');
		if (uddg) return decodeURIComponent(uddg);
		return parsed.toString();
	} catch {
		return u;
	}
}

export async function POST({ request }) {
	const body = await request.json().catch(() => null);
	const query = (body?.query ?? '').toString().trim();
	if (!query) return json({ results: [], error: 'Bitte eine Suchanfrage eingeben.' });

	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 10_000);

	try {
		const res = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
			method: 'GET',
			signal: controller.signal,
			headers: {
				'User-Agent':
					'Mozilla/5.0 (X11; Linux x86_64; rv:124.0) Gecko/20100101 Firefox/124.0',
				Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
				'Accept-Language': 'de-DE,de;q=0.9,en;q=0.8'
			}
		});

		if (!res.ok) {
			return json({ results: [], error: `Suchdienst nicht erreichbar (Status ${res.status}).` });
		}

		const html = await res.text();
		const results: Result[] = [];

		// Each hit is a block; the title link carries result__a, the snippet result__snippet.
		const blockRe = /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>([\s\S]*?)(?=<a[^>]*class="[^"]*result__a|$)/g;
		const snippetRe = /class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/;
		const snippetDivRe = /class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/(?:div|span|td)>/;

		let m: RegExpExecArray | null;
		while ((m = blockRe.exec(html)) && results.length < 8) {
			const url = resolveUrl(m[1]);
			const title = clean(m[2]);
			if (!title || !url) continue;
			const tail = m[3] ?? '';
			const sm = snippetRe.exec(tail) ?? snippetDivRe.exec(tail);
			const snippet = sm ? clean(sm[1]) : '';
			results.push({ title, url, snippet });
		}

		if (results.length === 0) {
			return json({
				results: [],
				error: 'Keine Treffer gefunden. Der Suchdienst hat eventuell sein Format geändert.'
			});
		}

		// Erfolgreiche Suche in der Recherche-Historie festhalten (Dedupe greift im Store).
		try {
			upsertSearch({ query, resultCount: results.length });
		} catch {
			/* Historie ist best-effort – Such-Antwort nie blockieren */
		}

		return json({ results });
	} catch (e) {
		const aborted = e instanceof Error && e.name === 'AbortError';
		return json({
			results: [],
			error: aborted ? 'Zeitüberschreitung – die Suche hat zu lange gedauert.' : 'Suche fehlgeschlagen.'
		});
	} finally {
		clearTimeout(timeout);
	}
}
