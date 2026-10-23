// Convert HTML fragments to plain text (search snippets, mail bodies).
//
// Entities are decoded in ONE pass first, then markup is removed by a small
// character-level scanner (no regex replace chains, so nested constructs like
// "<<script>script>" cannot survive and decoded entities can never reintroduce
// markup). A '<' is only kept literally when it cannot start markup (followed
// by whitespace, a digit or end of input, e.g. "3 < 5"). The output is plain
// text and must not be treated as HTML.

const NAMED_ENTITIES: Record<string, string> = {
	amp: '&',
	lt: '<',
	gt: '>',
	quot: '"',
	apos: "'",
	nbsp: ' '
};

const BLOCK_CLOSERS = new Set(['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'tr', 'table', 'blockquote']);
const RAW_TEXT = new Set(['script', 'style']);

export function decodeEntities(input: string): string {
	return input.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, body: string) => {
		if (body[0] === '#') {
			const hex = body[1] === 'x' || body[1] === 'X';
			const cp = hex ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
			if (!Number.isFinite(cp) || cp <= 0 || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) return match;
			return String.fromCodePoint(cp);
		}
		return NAMED_ENTITIES[body.toLowerCase()] ?? match;
	});
}

function isTagNameStart(c: string | undefined): boolean {
	return c !== undefined && /[A-Za-z]/.test(c);
}

/** Remove all markup. Block-level closers and <br> become line breaks. */
function stripMarkup(src: string): string {
	let out = '';
	let i = 0;
	const n = src.length;
	while (i < n) {
		const c = src[i];
		if (c !== '<') {
			out += c;
			i++;
			continue;
		}
		const next = src[i + 1];
		// Literal '<' that cannot start markup (end, whitespace, digit).
		if (next === undefined || /[\s\d]/.test(next)) {
			out += '<';
			i++;
			continue;
		}
		// Comment: skip to "-->" (or end).
		if (src.startsWith('<!--', i)) {
			const end = src.indexOf('-->', i + 4);
			i = end === -1 ? n : end + 3;
			continue;
		}
		const isClose = next === '/';
		const nameStart = isClose ? i + 2 : i + 1;
		if (!isTagNameStart(src[nameStart]) && next !== '!' && next !== '?') {
			// Something like "<<" or "<(": drop the '<' and continue scanning.
			i++;
			continue;
		}
		let j = nameStart;
		while (j < n && /[A-Za-z0-9-]/.test(src[j])) j++;
		const name = src.slice(nameStart, j).toLowerCase();
		const gt = src.indexOf('>', i + 1);
		const tagEnd = gt === -1 ? n : gt + 1;
		if (!isClose && RAW_TEXT.has(name)) {
			// Skip raw-text content up to the matching closing tag (or end).
			const closer = new RegExp('</' + name + '\\s*>', 'i');
			const m = closer.exec(src.slice(tagEnd));
			i = m ? tagEnd + m.index + m[0].length : n;
			continue;
		}
		if (name === 'br' || (isClose && BLOCK_CLOSERS.has(name))) out += '\n';
		i = tagEnd;
	}
	return out;
}

export function htmlToText(html: string): string {
	return stripMarkup(decodeEntities(html));
}
