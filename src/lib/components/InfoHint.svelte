<script lang="ts">
	import { hints } from '$lib/stores/hints.svelte';
	let { text }: { text: string } = $props();
</script>

{#if hints.enabled}
	<button class="info" type="button" aria-label={text}>
		<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
		<span class="bubble">{text}</span>
	</button>
{/if}

<style>
	.info {
		position: relative;
		border: none;
		background: none;
		padding: 0;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 16px;
		height: 16px;
		color: var(--text-faint);
		cursor: help;
		vertical-align: middle;
		transition: color 0.15s;
	}
	.info:hover, .info:focus-visible { color: var(--ember-bright); outline: none; }
	.bubble {
		position: absolute;
		bottom: calc(100% + 8px);
		left: 0;
		transform: translateY(4px);
		width: max-content;
		max-width: 250px;
		background: var(--surface-3);
		color: var(--text);
		font-size: 12px;
		font-weight: 400;
		line-height: 1.45;
		text-align: left;
		padding: 8px 11px;
		border: 1px solid var(--border-soft);
		border-radius: 8px;
		box-shadow: var(--shadow);
		opacity: 0;
		pointer-events: none;
		transition: opacity 0.16s, transform 0.16s var(--ease);
		z-index: 50;
		white-space: normal;
	}
	.info:hover .bubble, .info:focus-visible .bubble {
		opacity: 1;
		transform: translateY(0);
	}
</style>
