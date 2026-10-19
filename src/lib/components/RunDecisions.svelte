<script lang="ts">
	import { onMount } from 'svelte';
	import { i18n } from '$lib/stores/i18n.svelte';
	import type { Run, ToolCall } from '$lib/server/runtime/store';
	let runs = $state<Run[]>([]);
	let detail = $state<{ run: Run; calls: ToolCall[]; events: { seq: number; at: string; action: string; actor: string }[] } | null>(null);
	let busy = $state(false);
	let message = $state('');
	const en = $derived(i18n.lang === 'en');
	const labels = $derived<Record<string, string>>(en ? {
		queued: 'Queued', running: 'Running', waiting_for_approval: 'Awaiting approval', completed: 'Completed', failed: 'Failed', cancelled: 'Cancelled', pending: 'Awaiting approval', approved: 'Approved', rejected: 'Rejected'
	} : { queued: 'Eingereiht', running: 'Läuft', waiting_for_approval: 'Wartet auf Freigabe', completed: 'Abgeschlossen', failed: 'Fehlgeschlagen', cancelled: 'Abgebrochen', pending: 'Wartet auf Freigabe', approved: 'Freigegeben', rejected: 'Abgelehnt' });
	async function load() {
		try {
			const response = await fetch('/api/runs');
			if (!response.ok) throw new Error();
			runs = (await response.json()).runs;
			if (detail) await inspect(detail.run.id);
		} catch { message = en ? 'Could not load runs.' : 'Läufe konnten nicht geladen werden.'; }
	}
	async function inspect(id: string) {
		const response = await fetch(`/api/runs/${encodeURIComponent(id)}`);
		if (response.ok) detail = await response.json();
		else { detail = null; throw new Error(); }
	}
	async function act(action: 'approve' | 'reject' | 'cancel', callId?: string) {
		if (!detail || busy) return;
		busy = true; message = '';
		try {
			const response = await fetch(`/api/runs/${encodeURIComponent(detail.run.id)}`, {
				method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action, callId })
			});
			if (!response.ok) { const data = await response.json(); throw new Error(data.message ?? 'Aktion fehlgeschlagen.'); }
			await load();
		} catch (e) { message = e instanceof Error ? e.message : 'Fehler'; }
		finally { busy = false; }
	}
	onMount(() => {
		void load();
		const timer = setInterval(() => { if (!busy) void load(); }, 5000);
		return () => clearInterval(timer);
	});
</script>

<section class="runs" aria-label={en ? 'Agent runs' : 'Agentenläufe'}>
	<h2>{en ? 'Agent runs & tool approvals' : 'Agentenläufe & Werkzeug-Freigaben'}</h2>
	<p>{en ? 'Review the exact inputs before approving an action. Each approval executes once.' : 'Prüfe die konkreten Eingaben, bevor du eine Aktion freigibst. Jede Freigabe führt genau einen Aufruf aus.'}</p>
	{#if message}<p role="alert">{message}</p>{/if}
	{#if !runs.length}<p>{en ? 'No runs yet.' : 'Noch keine Läufe vorhanden.'}</p>{/if}
	<div class="run-list">
		{#each runs as run (run.id)}
			<button class="run" class:selected={detail?.run.id === run.id} onclick={() => inspect(run.id).catch(() => { message = en ? 'Could not load run.' : 'Lauf konnte nicht geladen werden.'; })}>
				<span>{run.title}</span><small>{labels[run.status]} · {new Date(run.createdAt).toLocaleString(en ? 'en-GB' : 'de-DE')}</small>
			</button>
		{/each}
	</div>
	{#if detail}
		<article class="detail">
			<h3>{detail.run.title}</h3>
			<p>{labels[detail.run.status]}</p>
			{#if detail.run.error}<p role="alert">{detail.run.error}</p>{/if}
			{#each detail.calls as call (call.id)}
				<div class="tool">
					<strong>{call.name}</strong> <span>{labels[call.status]}</span>
					<p>{call.reason}</p>
					<pre>{JSON.stringify(call.args, null, 2)}</pre>
					{#if call.status === 'pending'}
						<div class="actions"><button disabled={busy} onclick={() => act('approve', call.id)}>{en ? 'Approve & execute' : 'Freigeben & ausführen'}</button><button disabled={busy} onclick={() => act('reject', call.id)}>{en ? 'Reject' : 'Ablehnen'}</button></div>
					{/if}
					{#if call.error}<p role="alert">{call.error}</p>{/if}
					{#if call.result !== undefined}<details><summary>{en ? 'Result' : 'Ergebnis'}</summary><pre>{JSON.stringify(call.result, null, 2)}</pre></details>{/if}
				</div>
			{/each}
			{#if ['queued', 'running', 'waiting_for_approval'].includes(detail.run.status)}
				<button disabled={busy || detail.calls.some((c) => c.status === 'running')} onclick={() => act('cancel')}>{en ? 'Cancel run' : 'Lauf abbrechen'}</button>
			{/if}
			<details><summary>{en ? 'Audit trail' : 'Prüfprotokoll'}</summary><ol>{#each detail.events as event (event.seq)}<li>{new Date(event.at).toLocaleString()} — {event.action} ({event.actor})</li>{/each}</ol></details>
		</article>
	{/if}
</section>

<style>
	.runs { max-width: 860px; margin-bottom: 32px; }
	h2 { font-size: 18px; } p, small { color: var(--text-muted); }
	.run-list { display: grid; gap: 6px; max-height: 320px; overflow-y: auto; }
	.run { text-align: left; display: grid; gap: 5px; padding: 12px; border: 1px solid var(--border-soft); border-radius: 8px; background: var(--surface-1); color: var(--text); }
	.run.selected { border-color: var(--ember); }
	.detail { margin-top: 16px; padding: 18px; background: var(--surface-1); border: 1px solid var(--border-soft); border-radius: var(--radius); }
	.tool { padding: 14px 0; border-top: 1px solid var(--border-soft); }
	.tool > span { margin-left: 10px; font-size: 12px; color: var(--text-muted); }
	pre { overflow: auto; max-height: 300px; padding: 12px; background: var(--surface-2); font-size: 12px; white-space: pre-wrap; overflow-wrap: anywhere; }
	.actions { display: flex; flex-wrap: wrap; gap: 8px; }
	.actions button, .detail > button { border: 1px solid var(--border); border-radius: 8px; background: var(--surface-2); color: var(--text); padding: 8px 12px; }
	button:disabled { opacity: 0.5; cursor: not-allowed; }
	details { margin-top: 12px; } summary { cursor: pointer; } li { font-size: 12px; overflow-wrap: anywhere; }
</style>
