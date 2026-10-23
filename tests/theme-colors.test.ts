import { expect, it } from 'vitest';
import { contrastRatio, lightLinkColor } from '../src/lib/theme-colors';

it.each(['#f59a55', '#ecc46a', '#8ccfb3', '#6db8ec', '#b39bec', '#ee847c'])('keeps links readable for accent %s on light backgrounds', (color) => {
	const link = lightLinkColor(color);
	expect(contrastRatio(link, '#f5f1e9')).toBeGreaterThanOrEqual(4.5);
	expect(contrastRatio(link, '#fbf8f2')).toBeGreaterThanOrEqual(4.5);
	expect(contrastRatio('#1a1206', color)).toBeGreaterThanOrEqual(4.5);
});
