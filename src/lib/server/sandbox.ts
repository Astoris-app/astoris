// Eingeschränkter Ausführungs-Kontext für Code-Add-ons (node:vm).
// Bewusst minimal: nur fetch/JSON/Math/Date/console — kein require/process/fs.
// Kein vollständiger Sicherheits-Sandbox; nur für Self-Host-Code des Betreibers gedacht.

import vm from 'node:vm';

export type CodeRunResult = { ok: boolean; output?: unknown; error?: string };

export async function runCodeAddon(code: string, input: unknown, timeoutMs = 5000): Promise<CodeRunResult> {
	const logs: string[] = [];
	const sandbox = {
		fetch,
		JSON,
		Math,
		Date,
		console: { log: (...a: unknown[]) => logs.push(a.map(String).join(' ')) },
		input
	};
	const context = vm.createContext(sandbox, { name: 'astoris-addon' });
	const wrapped = `(async () => {\n${code}\nif (typeof run !== 'function') throw new Error('Code muss eine Funktion run(input) definieren.');\nreturn await run(input);\n})()`;
	try {
		const script = new vm.Script(wrapped, { filename: 'addon.js' });
		const promise = script.runInContext(context, { timeout: timeoutMs }) as Promise<unknown>;
		const output = await Promise.race([
			promise,
			new Promise((_, rej) => setTimeout(() => rej(new Error('Zeitüberschreitung')), timeoutMs))
		]);
		return { ok: true, output };
	} catch (e) {
		return { ok: false, error: e instanceof Error ? e.message : 'Ausführungsfehler' };
	}
}
