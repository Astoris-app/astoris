import { createHash } from 'node:crypto';
import { execution } from './context';
import { runtimeStore } from './index';
import { toolDecision } from './policy';
import type { ToolCall } from './store';

export function toolFingerprint(definition: unknown): string {
	return createHash('sha256').update(JSON.stringify(definition)).digest('hex');
}

export async function executePrepared(call: ToolCall, invoke: () => Promise<unknown>, actor: string): Promise<unknown> {
	const store = runtimeStore();
	store.claim(call.id, actor);
	try {
		const result = await invoke();
		const error = result && typeof result === 'object' && 'error' in result ? String(result.error) : undefined;
		store.finish(call.id, result ?? null, error);
		return result;
	} catch (e) {
		store.finish(call.id, null, e instanceof Error ? e.message : 'Werkzeug fehlgeschlagen.');
		throw e;
	}
}

export async function dispatchTool(input: {
	name: string; args: unknown; offered: ReadonlySet<string>; definition: unknown; invoke: () => Promise<unknown>;
}): Promise<unknown> {
	const context = execution.getStore();
	if (!context) throw new Error('Werkzeug ohne kontrollierten Agentenlauf blockiert.');
	const decision = toolDecision(input.name, input.offered, context.autonomy);
	if (!decision.allowed) {
		runtimeStore().recordToolDenial(context.runId, input.name, context.owner);
		return { error: decision.reason };
	}
	if (!input.args || typeof input.args !== 'object' || Array.isArray(input.args)) {
		runtimeStore().recordToolDenial(context.runId, input.name, context.owner);
		return { error: 'Werkzeug-Eingabe muss ein JSON-Objekt sein.' };
	}
	const store = runtimeStore();
	const call = store.prepare({
		runId: context.runId, name: input.name, args: input.args as Record<string, unknown>, risk: decision.risk,
		reason: decision.reason, fingerprint: toolFingerprint(input.definition)
	}, decision.approval);
	context.effectsStarted = true;
	if (decision.approval) return { pendingTool: { id: call.id, name: call.name, reason: call.reason },
		hinweis: 'Werkzeug noch NICHT ausgeführt. Der Betreiber muss die konkrete Aktion unter Entscheidungen freigeben.' };
	return executePrepared(call, input.invoke, context.owner);
}
