<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { APPS, FLOORS, OVERVIEW_APP, appsOnFloor } from '$lib/apps';
	import { i18n } from '$lib/stores/i18n.svelte';
	import Icon from './Icon.svelte';
	import Brand from './Brand.svelte';
	import EngineStatus from './EngineStatus.svelte';

	// Auf Mobile wird die Rail zum Off-Canvas-Drawer (vom Layout gesteuert).
	let { mobileOpen = false, onNavigate = () => {} }: { mobileOpen?: boolean; onNavigate?: () => void } = $props();

	// Etagen mit ihren Apps vorbereiten (Reihenfolge aus apps.ts).
	let floors = $derived(FLOORS.map((f) => ({ ...f, apps: appsOnFloor(f.id) })).filter((f) => f.apps.length > 0));
	let path = $derived(page.url.pathname);
	let expanded = $state(false);
	// Im Mobile-Drawer immer mit Labels (volle Breite), sonst Desktop-Verhalten unverändert.
	let showFull = $derived(expanded || mobileOpen);

	onMount(() => {
		try { expanded = localStorage.getItem('astoris-rail') === '1'; } catch { /* ignore */ }
	});
	function toggle() {
		expanded = !expanded;
		try { localStorage.setItem('astoris-rail', expanded ? '1' : '0'); } catch { /* ignore */ }
	}
	function isActive(href: string) {
		return href === '/' ? path === '/' : path.startsWith(href);
	}
</script>

<nav class="rail" class:expanded={showFull} class:mobile-open={mobileOpen} aria-label={i18n.t('common.areas')}>
	<button class="toggle" onclick={toggle} title={expanded ? i18n.t('common.collapseMenu') : i18n.t('common.expandMenu')} aria-label={i18n.t('common.menuToggle')}>
		<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
	</button>

	<a class="brand" href="/" title="Astoris" onclick={onNavigate}>
		<Brand size={30} />
		{#if showFull}<span class="brand-name">Astoris</span>{/if}
	</a>

	<div class="nav-scroll">
		<!-- Eingang / Lobby — steht über den Etagen -->
		<div class="group entrance">
			<a
				class="item entry"
				class:active={isActive(OVERVIEW_APP.href)}
				href={OVERVIEW_APP.href}
				aria-current={isActive(OVERVIEW_APP.href) ? 'page' : undefined}
				title={showFull ? '' : i18n.t('apps.uebersicht')}
				onclick={onNavigate}
			>
				<Icon path={OVERVIEW_APP.icon} />
				{#if showFull}<span class="label">{i18n.t('apps.uebersicht')}</span>{:else}<span class="tip">{i18n.t('apps.uebersicht')}</span>{/if}
			</a>
		</div>

		<!-- Vier Etagen des Firmengebäudes -->
		{#each floors as floor (floor.id)}
			<div class="floor" aria-label={i18n.t(floor.labelKey)}>
				{#if showFull}
					<div class="floor-label">
						<span class="floor-ico"><Icon path={floor.icon} /></span>
						<span class="floor-name">{i18n.t(floor.labelKey)}</span>
					</div>
				{:else}
					<div class="floor-sep" aria-hidden="true"></div>
				{/if}
				<div class="group">
					{#each floor.apps as app (app.id)}
						<a
							class="item"
							class:active={isActive(app.href)}
							href={app.href}
							aria-current={isActive(app.href) ? 'page' : undefined}
							title={showFull ? '' : i18n.t('apps.' + app.id)}
							onclick={onNavigate}
						>
							<Icon path={app.icon} />
							{#if showFull}<span class="label">{i18n.t('apps.' + app.id)}</span>{:else}<span class="tip">{i18n.t('apps.' + app.id)}</span>{/if}
							{#if !app.ready}<span class="soon" aria-hidden="true"></span>{/if}
						</a>
					{/each}
				</div>
			</div>
		{/each}
	</div>

	<div class="engine-wrap">
		<EngineStatus />
	</div>
</nav>

<style>
	.rail {
		width: var(--rail-w);
		flex: none;
		height: 100vh;
		background: var(--bg-veil);
		border-right: 1px solid var(--border-soft);
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 12px 0 12px;
		gap: 5px;
		transition: width 0.22s var(--ease);
		overflow: hidden;
	}
	.rail.expanded {
		width: 208px;
		align-items: stretch;
		padding: 12px 12px 12px;
	}
	.toggle {
		width: 40px;
		height: 40px;
		flex: none;
		display: grid;
		place-items: center;
		border-radius: 10px;
		color: var(--text-faint);
		background: transparent;
		border: none;
		margin-bottom: 4px;
		transition: color 0.16s, background 0.16s;
	}
	.rail.expanded .toggle { margin-left: 2px; }
	.toggle:hover { color: var(--text); background: var(--surface-1); }
	.brand {
		display: flex;
		align-items: center;
		gap: 12px;
		height: 44px;
		border-radius: 12px;
		margin-bottom: 8px;
		padding-left: 7px;
		flex: none;
		transition: transform 0.25s var(--ease);
	}
	.rail:not(.expanded) .brand { width: 44px; justify-content: center; padding-left: 0; align-self: center; }
	.brand:hover { transform: scale(1.04); }
	.brand-name { font-family: var(--font-display); font-weight: 600; font-size: 17px; color: var(--text); letter-spacing: -0.01em; }

	/* Scrollbarer Mittelteil (alle Etagen) — Brand + Engine bleiben fix. */
	.nav-scroll {
		flex: 1;
		min-height: 0;
		width: 100%;
		display: flex;
		flex-direction: column;
		gap: 5px;
		overflow-y: auto;
		overflow-x: hidden;
		scrollbar-width: thin;
		scrollbar-color: var(--border) transparent;
	}
	.nav-scroll::-webkit-scrollbar { width: 6px; }
	.nav-scroll::-webkit-scrollbar-thumb { background: var(--border); border-radius: 999px; }
	.rail:not(.expanded) .nav-scroll { align-items: center; }

	.group { display: flex; flex-direction: column; gap: 3px; width: 100%; }
	.rail:not(.expanded) .group { align-items: center; }

	/* Etagen-Block: dezenter Abstand trennt die Gruppen. */
	.floor { width: 100%; display: flex; flex-direction: column; gap: 3px; margin-top: 6px; }
	.rail:not(.expanded) .floor { align-items: center; margin-top: 8px; }
	.entrance { margin-bottom: 2px; }

	/* Etagen-Label (nur ausgeklappt) — dezent, mit Etagen-Icon. */
	.floor-label {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 4px 12px 3px;
		color: var(--text-faint);
		font-size: 11px;
		font-family: var(--font-mono);
		text-transform: uppercase;
		letter-spacing: 0.1em;
	}
	.floor-ico { display: grid; place-items: center; opacity: 0.7; }
	.floor-ico :global(svg) { width: 14px; height: 14px; }
	.floor-name { white-space: nowrap; }

	/* Trenner zwischen Gruppen (nur eingeklappt) — sehr dezent. */
	.floor-sep {
		width: 22px;
		height: 1px;
		flex: none;
		background: var(--border-soft);
		margin: 3px 0 4px;
	}

	.item {
		position: relative;
		display: flex;
		align-items: center;
		gap: 13px;
		height: 44px;
		border-radius: 11px;
		color: var(--text-muted);
		transition: color 0.18s, background 0.18s;
		padding: 0 12px;
	}
	.rail:not(.expanded) .item { width: 44px; padding: 0; justify-content: center; }
	.item:hover { color: var(--text); background: var(--surface-1); }
	.item.active { color: var(--ember-bright); background: var(--ember-soft); }
	.item.entry { color: var(--text); }
	.item.entry.active { color: var(--ember-bright); }
	.rail.expanded .item.active::before { display: none; }
	.item.active::before {
		content: '';
		position: absolute;
		left: -12px;
		top: 50%;
		transform: translateY(-50%);
		width: 3px;
		height: 22px;
		border-radius: 0 3px 3px 0;
		background: var(--ember);
	}
	.label { font-size: 14px; white-space: nowrap; }
	.soon {
		position: absolute;
		width: 5px;
		height: 5px;
		border-radius: 50%;
		background: var(--text-faint);
	}
	.rail:not(.expanded) .soon { top: 9px; right: 9px; }
	.rail.expanded .soon { right: 12px; top: 50%; transform: translateY(-50%); }
	/* Tooltip nur im eingeklappten Zustand */
	.tip {
		position: absolute;
		left: calc(100% + 12px);
		top: 50%;
		transform: translateY(-50%) translateX(-4px);
		background: var(--surface-3);
		color: var(--text);
		font-size: 12.5px;
		padding: 5px 10px;
		border-radius: 7px;
		white-space: nowrap;
		pointer-events: none;
		opacity: 0;
		transition: opacity 0.16s, transform 0.16s var(--ease);
		box-shadow: var(--shadow);
		z-index: 30;
	}
	.item:hover .tip { opacity: 1; transform: translateY(-50%) translateX(0); }
	.engine-wrap { width: 100%; display: grid; place-items: center; margin-top: 8px; flex: none; }
	.rail.expanded .engine-wrap { place-items: stretch; }
	.engine-wrap :global(.engine) { padding: 8px; border: none; background: transparent; }
	.rail:not(.expanded) .engine-wrap :global(.meta) { display: none; }

	/* --- Mobile: Off-Canvas-Drawer (≤ 760px). Desktop bleibt unverändert. --- */
	@media (max-width: 760px) {
		.rail {
			position: fixed;
			top: 0;
			left: 0;
			bottom: 0;
			z-index: 90;
			transform: translateX(-100%);
			transition: transform 0.24s var(--ease);
			box-shadow: var(--shadow);
		}
		/* .mobile-open hat dieselbe Spezifität wie .rail.expanded, steht aber später → gewinnt die Breite. */
		.rail.mobile-open { transform: translateX(0); width: 244px; max-width: 84vw; }
		/* Einklapp-Toggle ergibt im Drawer keinen Sinn. */
		.toggle { display: none; }
	}
</style>
