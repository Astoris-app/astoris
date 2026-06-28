<script lang="ts">
	import '$lib/styles/app.css';
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { afterNavigate } from '$app/navigation';
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
		'/': 'Assistent', '/uebersicht': 'Übersicht', '/mail': 'Posteingang', '/docs': 'Dokumente', '/research': 'Recherche',
		'/studio': 'Studio', '/calendar': 'Kalender', '/agents': 'Team', '/firma': 'Cockpit', '/crm': 'CRM', '/metrics': 'Kennzahlen', '/optimierung': 'Optimierung', '/entscheidungen': 'Entscheidungen', '/marketing': 'Marketing', '/tresor': 'Tresor',
		'/connections': 'Verbindungen', '/erweiterungen': 'Erweiterungen', '/logs': 'Systemprotokoll', '/settings': 'Einstellungen',
		'/welcome': 'Willkommen', '/login': 'Anmelden'
	};
	let pageTitle = $derived('Astoris · ' + (PAGE_TITLES[page.url.pathname] ?? 'Maschinenraum'));

	// Mobile: App-Rail wird zum Off-Canvas-Drawer (siehe AppRail + Media-Query).
	let mobileNavOpen = $state(false);
	function closeNav() { mobileNavOpen = false; }
	function toggleNav() { mobileNavOpen = !mobileNavOpen; }
	// Bei jedem Routenwechsel schließen (deckt auch Klick auf aktive Route via Item-onclick ab).
	afterNavigate(() => { mobileNavOpen = false; });
	function onKeydown(e: KeyboardEvent) { if (e.key === 'Escape') mobileNavOpen = false; }

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
<svelte:window onkeydown={onKeydown} />

<div class="shell">
	{#if showRail}
		<button
			class="navtoggle"
			aria-label={mobileNavOpen ? i18n.t('common.closeMenu') : i18n.t('common.openMenu')}
			aria-expanded={mobileNavOpen}
			onclick={toggleNav}
		>
			<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
		</button>
		{#if mobileNavOpen}
			<button class="app-backdrop" aria-label={i18n.t('common.closeMenu')} onclick={closeNav}></button>
		{/if}
		<AppRail mobileOpen={mobileNavOpen} onNavigate={closeNav} />
	{/if}
	<main class="canvas" class:has-rail={showRail}>
		{@render children()}
	</main>
	{#if showRail && page.url.pathname !== '/'}
		<a class="chat-fab" href="/" title={i18n.t('apps.chat')} aria-label={i18n.t('apps.chat')}>
			<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
		</a>
	{/if}
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

	.chat-fab {
		position: fixed;
		top: 9px;
		right: 11px;
		z-index: 65;
		width: 40px;
		height: 40px;
		display: grid;
		place-items: center;
		border-radius: 11px;
		color: var(--text);
		background: var(--surface-1);
		border: 1px solid var(--border-soft);
		box-shadow: var(--shadow);
	}
	.chat-fab:hover { border-color: var(--ember-line); color: var(--ember-bright); }

	/* --- Mobile-Navigation (≤ 760px) — Desktop bleibt unberührt --- */
	.navtoggle {
		display: none; /* nur via .only-mobile auf Mobile sichtbar */
		position: fixed;
		top: 9px;
		left: 11px;
		z-index: 70;
		width: 40px;
		height: 40px;
		place-items: center;
		border-radius: 11px;
		color: var(--text);
		background: var(--surface-1);
		border: 1px solid var(--border-soft);
		box-shadow: var(--shadow);
	}
	.navtoggle:hover { border-color: var(--ember-line); }

	@media (max-width: 760px) {
		.navtoggle { display: grid; }
		/* Platz für den schwebenden Menü-Button schaffen (nur wenn Rail aktiv). */
		.canvas.has-rail { padding-top: 52px; }
	}
</style>
