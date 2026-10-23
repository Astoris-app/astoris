import { describe, expect, it } from 'vitest';
import { decodeEntities, htmlToText } from '../src/lib/server/html-text';

describe('html-text', () => {
	it('decodes entities once (no double decoding)', () => {
		expect(decodeEntities('a &amp;lt; b &lt; c &#39;d&#x27; &nbsp;e')).toBe("a &lt; b < c 'd'  e");
		expect(decodeEntities('&bogus; &#0; &#xD800;')).toBe('&bogus; &#0; &#xD800;');
	});
	it('never lets decoded entities reintroduce markup', () => {
		expect(htmlToText('x &lt;script&gt;alert(1)&lt;/script&gt; y')).toBe('x  y');
		expect(htmlToText('<<script>script>alert(1)<</script>/script>')).not.toContain('<');
		expect(htmlToText('<p>Hallo<br>Welt</p><!-- c --><style>p{}</style>')).toBe('Hallo\nWelt\n');
	});
	it('keeps readable text', () => {
		expect(htmlToText('<b>Preis:</b> 3 &euro; &amp; mehr').trim()).toBe('Preis: 3 &euro; & mehr');
	});
});
