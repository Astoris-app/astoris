<script lang="ts">
	// Modell-/Engine-Status ist global im Maschinenraum-Badge (AppRail unten) verankert
	// und auf jeder Seite sichtbar — hier daher bewusst kein eigenes Pill mehr (Redundanz).
	let { title, eyebrow = '', children }: { title: string; eyebrow?: string; children?: import('svelte').Snippet } = $props();
</script>

<header class="hd">
	<div class="lead">
		{#if eyebrow}<span class="eyebrow">{eyebrow}</span>{/if}
		<h1>{title}</h1>
	</div>
	{#if children}
		<div class="right">{@render children()}</div>
	{/if}
</header>

<style>
	.hd {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 16px;
		row-gap: 10px;
		padding: 22px 28px 18px;
		border-bottom: 1px solid var(--border-soft);
		flex: none;
	}
	.lead h1 { font-size: 21px; margin-top: 3px; }
	.right { display: flex; align-items: center; gap: 10px; }
</style>
