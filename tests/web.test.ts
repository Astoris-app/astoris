import { describe, expect, it } from 'vitest';
import { hostAllowed, readWebPage } from '../src/lib/server/web';
import { toolDecision, toolRisk } from '../src/lib/server/runtime/policy';

describe('web_lesen', () => {
	it('matches exact domains and subdomains only', () => {
		const list = ['batteriepass-online.eu', '*.europa.eu'];
		expect(hostAllowed('batteriepass-online.eu', list)).toBe(true);
		expect(hostAllowed('www.batteriepass-online.eu', list)).toBe(true);
		expect(hostAllowed('eur-lex.europa.eu', list)).toBe(true);
		expect(hostAllowed('evilbatteriepass-online.eu', list)).toBe(false);
		expect(hostAllowed('batteriepass-online.eu.evil.com', list)).toBe(false);
	});
	it('rejects without network access when not allowed', async () => {
		expect((await readWebPage('https://example.com', [])).error).toMatch(/Keine Lese-Domains/);
		expect((await readWebPage('https://example.com', ['batteriepass-online.eu'])).error).toMatch(/nicht freigegeben/);
		expect((await readWebPage('file:///etc/passwd', ['batteriepass-online.eu'])).error).toMatch(/http/);
		expect((await readWebPage('https://u:p@batteriepass-online.eu', ['batteriepass-online.eu'])).error).toMatch(/Zugangsdaten/);
		expect((await readWebPage('kein link', ['x.de'])).error).toMatch(/Ungültige URL/);
	});
	it('is a read tool without approval, but only when offered', () => {
		expect(toolRisk('web_lesen')).toBe('read');
		expect(toolDecision('web_lesen', new Set(['web_lesen']), 1).approval).toBe(false);
		expect(toolDecision('web_lesen', new Set(), 5).allowed).toBe(false);
	});
});
