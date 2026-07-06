// Web-Suche über die DuckDuckGo-HTML-Endpoint (kein API-Key nötig).
// Gemeinsame Quelle für die Schnellsuche (api/research) und die Deep-Research-Pipeline.

export type SearchResult = { title: string; url: string; snippet: string };

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

/**
 * Führt eine einzelne DuckDuckGo-Suche aus. Wirft bei Netz-/Statusfehlern
 * (Aufrufer entscheidet, ob best-effort ignoriert wird).
 */
export async function ddgSearch(query: string, limit = 8, timeoutMs = 10_000): Promise<SearchResult[]> {
	const q = query.trim();
	if (!q) return [];
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), timeoutMs);
	try {
		const res = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`, {
			method: 'GET',
			signal: controller.signal,
			headers: {
				'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:124.0) Gecko/20100101 Firefox/124.0',
				Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
				'Accept-Language': 'de-DE,de;q=0.9,en;q=0.8'
			}
		});
		if (!res.ok) throw new Error(`Suchdienst Status ${res.status}`);
		const html = await res.text();
		const results: SearchResult[] = [];
		const blockRe = /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>([\s\S]*?)(?=<a[^>]*class="[^"]*result__a|$)/g;
		const snippetRe = /class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/;
		const snippetDivRe = /class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/(?:div|span|td)>/;
		let m: RegExpExecArray | null;
		while ((m = blockRe.exec(html)) && results.length < limit) {
			const url = resolveUrl(m[1]);
			const title = clean(m[2]);
			if (!title || !url) continue;
			const tail = m[3] ?? '';
			const sm = snippetRe.exec(tail) ?? snippetDivRe.exec(tail);
			const snippet = sm ? clean(sm[1]) : '';
			results.push({ title, url, snippet });
		}
		return results;
	} finally {
		clearTimeout(timeout);
	}
}
