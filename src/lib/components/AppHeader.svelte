<script lang="ts">
	import { engine } from '$lib/stores/engine.svelte';
	let { title, eyebrow = '', children }: { title: string; eyebrow?: string; children?: import('svelte').Snippet } = $props();
	let s = $derived(engine.status);
</script>

<header class="hd">
	<div class="lead">
		{#if eyebrow}<span class="eyebrow">{eyebrow}</span>{/if}
		<h1>{title}</h1>
	</div>
	<div class="right">
		{#if children}{@render children()}{/if}
		<div class="pill" data-on={s.online}>
			<span class="dot"></span>
			<span class="mono">{s.model}</span>
		</div>
	</div>
</header>

<style>
	.hd {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		gap: 16px;
		padding: 22px 28px 18px;
		border-bottom: 1px solid var(--border-soft);
		flex: none;
	}
	.lead h1 { font-size: 21px; margin-top: 3px; }
	.right { display: flex; align-items: center; gap: 10px; }
	.pill {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 6px 12px;
		border-radius: 999px;
		border: 1px solid var(--border-soft);
		background: var(--surface-1);
		font-size: 12px;
		color: var(--text-muted);
	}
	.dot { width: 7px; height: 7px; border-radius: 50%; background: var(--text-faint); }
	.pill[data-on='true'] .dot { background: var(--sage); }
	.pill[data-on='true'] { color: var(--text); }
</style>
