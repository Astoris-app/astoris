<script lang="ts">
	import { APPS } from '$lib/apps';
	import AppHeader from './AppHeader.svelte';
	import Icon from './Icon.svelte';

	let { id }: { id: string } = $props();
	let app = $derived(APPS.find((a) => a.id === id)!);
</script>

<AppHeader title={app.label} eyebrow="Bereich" />
<div class="body">
	<div class="card">
		<div class="glyph"><Icon path={app.icon} size={26} /></div>
		<h2>{app.label}</h2>
		<p>{app.blurb}</p>
		<span class="tag mono">in Vorbereitung</span>
	</div>
</div>

<style>
	.body {
		flex: 1;
		display: grid;
		place-items: center;
		padding: 28px;
	}
	.card {
		max-width: 380px;
		text-align: center;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 12px;
	}
	.glyph {
		width: 56px;
		height: 56px;
		display: grid;
		place-items: center;
		border-radius: 16px;
		color: var(--ember-bright);
		background: var(--ember-soft);
		border: 1px solid var(--ember-line);
	}
	h2 {
		font-size: 18px;
	}
	p {
		color: var(--text-muted);
		margin: 0;
		font-size: 14px;
	}
	.tag {
		margin-top: 4px;
		font-size: 10.5px;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--text-faint);
		border: 1px solid var(--border-soft);
		padding: 4px 10px;
		border-radius: 999px;
	}
</style>
