import { describe, expect, it } from 'vitest';
import { decodeEntities, htmlToText } from '../src/lib/server/html-text';

describe('html-text', () => {
	it('decodes entities once (no double decoding)', () => {
		expect(decodeEntities('a &amp;lt; b &lt; c &#39;d&#x27; &nbsp;e')).toBe("a &lt; b < c 'd'  e");
		expect(decodeEntities('&bogus; &#0; &#xD800;')).toBe('&bogus; &#0; &#xD800;');
	});
	it('never lets decoded entities or nesting reintroduce markup', () => {
		expect(htmlToText('x &lt;script&gt;alert(1)&lt;/script&gt; y')).toBe('x  y');
		for (const evil of [
			'<<script>script>alert(1)<</script>/script>',
			'<scr<script>ipt>alert(1)</script>',
			'<!-<!-- x -->- y -->',
			'&lt;img src=x onerror=alert(1)&gt;',
			'<a href="x>y">z</a><scri\u0000pt>'
		]) {
			const t = htmlToText(evil);
			expect(t).not.toMatch(/<\s*(script|img|a|!--)/i);
		}
	});
	it('keeps readable text and literal comparisons', () => {
		expect(htmlToText('<p>Hallo<br>Welt</p><!-- c --><style>p{}</style>')).toBe('Hallo\nWelt\n');
		expect(htmlToText('<b>Preis:</b> 3 &euro; &amp; mehr').trim()).toBe('Preis: 3 &euro; & mehr');
		expect(htmlToText('3 < 5 und 7 <9')).toBe('3 < 5 und 7 <9');
	});
});
