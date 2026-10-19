import { describe, expect, it } from 'vitest';
import { toolDecision } from '../src/lib/server/runtime/policy';

describe('tool policy evaluations', () => {
	const allowed = new Set(['calendar_list', 'calendar_create', 'calendar_delete', 'mail_send', 'messenger_send', 'addon_erstellen', 'weather']);
	it('blocks hallucinated, unoffered tools even for autonomous agents', () => {
		expect(toolDecision('calendar_create', new Set(), 5).allowed).toBe(false);
		expect(toolDecision('shell_execute', allowed, 5).allowed).toBe(false);
	});
	it.each([0, 1, 2, 3])('requires confirmation for changes at autonomy %s', (level) => {
		expect(toolDecision('calendar_create', allowed, level).approval).toBe(true);
	});
	it.each([4, 5])('allows scoped calendar changes at autonomy %s', (level) => {
		expect(toolDecision('calendar_create', allowed, level).approval).toBe(false);
		expect(toolDecision('calendar_delete', allowed, level).approval).toBe(true);
	});
	it('requires exact-input approval for every add-on, regardless of its name or autonomy', () => {
		expect(toolDecision('weather', allowed, 5).approval).toBe(true);
		expect(toolDecision('calendar_list_evil', new Set(['calendar_list_evil']), 5).risk).toBe('external');
	});
	it('permits reading and drafting without granting sending or installation rights', () => {
		for (const tool of ['calendar_list', 'mail_send', 'messenger_send', 'addon_erstellen']) expect(toolDecision(tool, allowed, 1).approval).toBe(false);
	});
});
