import { describe, expect, it } from 'vitest';
import { guardedFetch, runCodeAddon } from '../src/lib/server/sandbox';

describe('supervised addon processes', () => {
	it('runs JSON transformations and crypto without parent environment access', async () => {
		expect(await runCodeAddon('async function run(input) { return { value: input.n * 2, process: typeof process, require: typeof require }; }', { n: 21 }))
			.toEqual({ ok: true, output: { value: 42, process: 'undefined', require: 'undefined' }, error: undefined });
	});
	it('kills an infinite async continuation without blocking the server', async () => {
		const result = await runCodeAddon('async function run() { await Promise.resolve(); while (true) {} }', {}, 200);
		expect(result.ok).toBe(false);
		expect(await runCodeAddon('function run() { return 7; }', {})).toMatchObject({ ok: true, output: 7 });
	});
	it('blocks filesystem access even through host-function constructors', async () => {
		const result = await runCodeAddon('function run() { const p = fetch.constructor("return process")(); return p.getBuiltinModule("fs").readFileSync("/etc/passwd", "utf8"); }', {});
		expect(result.ok).toBe(false);
	});
	it('blocks normal network access to private and metadata addresses', async () => {
		for (const url of ['http://127.0.0.1', 'http://169.254.169.254', 'file:///etc/passwd']) {
			await expect(guardedFetch(url)).rejects.toThrow();
		}
		const result = await runCodeAddon('async function run() { return await (await fetch("http://127.0.0.1")).text(); }', {});
		expect(result.ok).toBe(false);
	});
	it('rejects oversized input without starting a child', async () => {
		expect(await runCodeAddon('function run(){}', { text: 'x'.repeat(600000) })).toMatchObject({ ok: false });
	});
});
