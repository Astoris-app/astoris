// Convert HTML fragments to plain text (search snippets, mail bodies).
//
// Entities are decoded in ONE pass before tags are stripped, and tag stripping
// repeats until the result is stable. Decoded entities can therefore never
// reintroduce markup and nested constructs like "<<script>script>" are removed
// completely (CodeQL js/double-escaping, js/incomplete-multi-character-sanitization).
// The output is plain text and must not be treated as HTML.

const NAMED_ENTITIES: Record<string, string> = {
	amp: '&',
	lt: '<',
	gt: '>',
	quot: '"',
	apos: "'",
	nbsp: ' '
};

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

/** Strip all markup. Block-level closers and <br> become line breaks. */
export function htmlToText(html: string): string {
	let out = decodeEntities(html);
	let prev: string;
	do {
		prev = out;
		out = out
			.replace(/<!--[\s\S]*?-->/g, '')
			.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
			.replace(/<\/(p|div|h[1-6]|li|tr|table|blockquote)\s*>/gi, '\n')
			.replace(/<br\s*\/?>/gi, '\n')
			.replace(/<[^>]*>/g, '');
	} while (out !== prev);
	return out;
}
