<script lang="ts">
	import '$lib/styles/app.css';
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import AppRail from '$lib/components/AppRail.svelte';
	import { engine } from '$lib/stores/engine.svelte';
	import { theme } from '$lib/stores/theme.svelte';
	import { i18n } from '$lib/stores/i18n.svelte';
	import { hints } from '$lib/stores/hints.svelte';
	import { voice } from '$lib/stores/voice.svelte';

	let { children } = $props();
	// Onboarding läuft ohne App-Rail (eigener Vollbild-Flow).
	let showRail = $derived(!page.url.pathname.startsWith('/welcome') && !page.url.pathname.startsWith('/login'));

	// Seitentitel je Route (vermeidet „untitled page").
	const PAGE_TITLES: Record<string, string> = {
		'/': 'Assistent', '/mail': 'Posteingang', '/docs': 'Dokumente', '/research': 'Recherche',
		'/studio': 'Studio', '/calendar': 'Kalender', '/agents': 'Team', '/tresor': 'Tresor',
		'/connections': 'Verbindungen', '/erweiterungen': 'Erweiterungen', '/settings': 'Einstellungen',
		'/welcome': 'Willkommen', '/login': 'Anmelden'
	};
	let pageTitle = $derived('Astoris · ' + (PAGE_TITLES[page.url.pathname] ?? 'Maschinenraum'));

	onMount(() => {
		theme.init();
		i18n.init();
		hints.init();
		voice.init();
		engine.start();
		return () => engine.stop();
	});
</script>

<svelte:head><title>{pageTitle}</title></svelte:head>

<div class="shell">
	{#if showRail}<AppRail />{/if}
	<main class="canvas">
		{@render children()}
	</main>
</div>

<style>
	.shell {
		display: flex;
		height: 100vh;
		overflow: hidden;
	}
	.canvas {
		flex: 1;
		min-width: 0;
		height: 100vh;
		overflow: hidden;
		display: flex;
		flex-direction: column;
		background:
			radial-gradient(120% 80% at 100% 0%, rgba(232, 132, 60, 0.05), transparent 55%),
			var(--bg);
	}
</style>
