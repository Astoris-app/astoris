<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { APPS, FLOORS, OVERVIEW_APP, appsOnFloor } from '$lib/apps';
	import { i18n } from '$lib/stores/i18n.svelte';
	import Icon from './Icon.svelte';
	import Brand from './Brand.svelte';
	import EngineStatus from './EngineStatus.svelte';
	import CompanyWizard from './CompanyWizard.svelte';

	// --- Company-Switcher (Multi-Company) ---
	type CompanyMeta = { id: string; name: string; industry?: string };
	let companies = $state<CompanyMeta[]>([]);
	let activeId = $state('');
	let csOpen = $state(false); // Firmen-Dropdown offen?
	let wizardOpen = $state(false); // „Neue Firma"-Assistent offen?
	let switching = $state(false);
	let switcherEl = $state<HTMLElement>();
	let popStyle = $state('');

	let activeCompany = $derived(companies.find((c) => c.id === activeId) ?? null);
	let activeName = $derived(activeCompany?.name ?? 'Astoris');
	let activeInitial = $derived((activeName.trim()[0] ?? 'A').toUpperCase());

	async function loadCompanies() {
		try {
			const r = await fetch('/api/companies');
			if (r.ok) {
				const d = await r.json();
				companies = Array.isArray(d?.companies) ? d.companies : [];
				activeId = (d?.active ?? '').toString();
			}
		} catch { /* Switcher bleibt leer, Rail funktioniert weiter */ }
	}

	// Dropdown öffnen + an der aktuellen Position des Buttons ausrichten (fixed → nicht vom
	// overflow:hidden der Rail abgeschnitten, funktioniert in allen Modi inkl. Mobile-Drawer).
	function openDropdown() {
		if (!switcherEl) return;
		const r = switcherEl.getBoundingClientRect();
		popStyle = `top:${Math.round(r.bottom + 6)}px; left:${Math.round(r.left)}px; min-width:${Math.round(Math.max(r.width, 210))}px;`;
		csOpen = true;
	}
	function toggleDropdown() {
		if (csOpen) csOpen = false;
		else openDropdown();
	}

	async function switchTo(id: string) {
		csOpen = false;
		if (id === activeId || switching) return;
		switching = true;
		try {
			await fetch('/api/companies', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ action: 'switch', id })
			});
			// Voller Reload, damit ALLE Module die neue aktive Firma frisch laden.
			location.reload();
		} catch {
			switching = false;
		}
	}

	function openWizard() {
		csOpen = false;
		wizardOpen = true;
	}
	function onWizardDone() {
		wizardOpen = false;
		// Neue Firma ist jetzt aktiv → in die Übersicht und alles frisch laden.
		location.href = OVERVIEW_APP.href;
	}

	// Auf Mobile wird die Rail zum Off-Canvas-Drawer (vom Layout gesteuert).
	let { mobileOpen = false, onNavigate = () => {} }: { mobileOpen?: boolean; onNavigate?: () => void } = $props();

	// Etagen mit ihren Apps vorbereiten (Reihenfolge aus apps.ts).
	let floors = $derived(FLOORS.map((f) => ({ ...f, apps: appsOnFloor(f.id) })).filter((f) => f.apps.length > 0));
	let path = $derived(page.url.pathname);
	let expanded = $state(false);
	// Im Mobile-Drawer immer mit Labels (volle Breite), sonst Desktop-Verhalten unverändert.
	let showFull = $derived(expanded || mobileOpen);

	// Akkordeon: pro Etage offen/zu. Explizite Wahl wird in localStorage gemerkt;
	// Etagen ohne Eintrag fallen auf den Standard zurück (aktuelle Etage offen).
	let openFloors = $state<Record<string, boolean>>({});

	function isActive(href: string) {
		return href === '/' ? path === '/' : path.startsWith(href);
	}
	// Etage der aktuell offenen Seite (für den Standard-Aufklappzustand).
	let activeFloorId = $derived(floors.find((f) => f.apps.some((a) => isActive(a.href)))?.id ?? null);
	// Offen, wenn explizit gewählt — sonst Standard: nur die aktive Etage offen.
	function floorOpen(id: string): boolean {
		return id in openFloors ? openFloors[id] : id === activeFloorId;
	}

	onMount(() => {
		loadCompanies();
		try { expanded = localStorage.getItem('astoris-rail') === '1'; } catch { /* ignore */ }
		try {
			const raw = localStorage.getItem('astoris-floors-open');
			if (raw) {
				const parsed = JSON.parse(raw);
				if (parsed && typeof parsed === 'object') openFloors = parsed;
			}
		} catch { /* ignore */ }
	});
	function toggle() {
		expanded = !expanded;
		try { localStorage.setItem('astoris-rail', expanded ? '1' : '0'); } catch { /* ignore */ }
	}
	function toggleFloor(id: string) {
		openFloors = { ...openFloors, [id]: !floorOpen(id) };
		try { localStorage.setItem('astoris-floors-open', JSON.stringify(openFloors)); } catch { /* ignore */ }
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

	<!-- Company-Switcher: aktive Firma anzeigen + umschalten / neue anlegen -->
	<button
		class="switcher"
		class:open={csOpen}
		bind:this={switcherEl}
		onclick={toggleDropdown}
		aria-haspopup="listbox"
		aria-expanded={csOpen}
		title={showFull ? '' : activeName}
		disabled={switching}
	>
		<span class="cs-badge" aria-hidden="true">{activeInitial}</span>
		{#if showFull}
			<span class="cs-meta">
				<span class="cs-eyebrow">{i18n.t('companies.label')}</span>
				<span class="cs-name">{activeName}</span>
			</span>
			<svg class="cs-chev" class:open={csOpen} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
		{:else}
			<span class="tip">{activeName}</span>
		{/if}
	</button>

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

		<!-- Ein App-Link (in Akkordeon und Icon-Modus gleich) -->
		{#snippet appLink(app: (typeof floors)[number]['apps'][number])}
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
		{/snippet}

		<!-- Vier Etagen des Firmengebäudes -->
		{#each floors as floor (floor.id)}
			<div class="floor" aria-label={i18n.t(floor.labelKey)}>
				{#if showFull}
					<!-- Ausgeklappt/Mobile: Etage als Akkordeon -->
					{@const open = floorOpen(floor.id)}
					<button
						class="floor-header"
						class:open
						aria-expanded={open}
						onclick={() => toggleFloor(floor.id)}
					>
						<span class="floor-ico"><Icon path={floor.icon} /></span>
						<span class="floor-name">{i18n.t(floor.labelKey)}</span>
						<svg class="chev" class:open viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>
					</button>
					<div class="floor-apps" class:open>
						<div class="floor-apps-inner">
							{#each floor.apps as app (app.id)}
								{@render appLink(app)}
							{/each}
						</div>
					</div>
				{:else}
					<!-- Eingeklappte Leiste: nur Icons, kein Akkordeon -->
					<div class="floor-sep" aria-hidden="true"></div>
					<div class="group">
						{#each floor.apps as app (app.id)}
							{@render appLink(app)}
						{/each}
					</div>
				{/if}
			</div>
		{/each}
	</div>

	<div class="engine-wrap">
		<EngineStatus />
	</div>
</nav>

<!-- Firmen-Dropdown (fixed → außerhalb des overflow:hidden der Rail) -->
{#if csOpen}
	<button class="cs-backdrop" aria-label={i18n.t('common.cancel')} onclick={() => (csOpen = false)}></button>
	<div class="cs-pop" style={popStyle} role="listbox" aria-label={i18n.t('companies.label')}>
		<div class="cs-list">
			{#each companies as c (c.id)}
				<button
					class="cs-item"
					class:active={c.id === activeId}
					role="option"
					aria-selected={c.id === activeId}
					onclick={() => switchTo(c.id)}
				>
					<span class="cs-badge sm" aria-hidden="true">{(c.name.trim()[0] ?? '?').toUpperCase()}</span>
					<span class="cs-item-name">{c.name}</span>
					{#if c.id === activeId}
						<svg class="cs-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5" /></svg>
					{/if}
				</button>
			{/each}
		</div>
		<button class="cs-new" onclick={openWizard}>
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
			{i18n.t('companies.newCompany')}
		</button>
	</div>
{/if}

<!-- „Neue Firma"-Assistent als Modal -->
{#if wizardOpen}
	<div class="wiz-overlay" role="presentation" onclick={(e) => { if (e.target === e.currentTarget) wizardOpen = false; }}>
		<CompanyWizard onDone={onWizardDone} onCancel={() => (wizardOpen = false)} />
	</div>
{/if}

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

	/* --- Company-Switcher --- */
	.switcher {
		display: flex;
		align-items: center;
		gap: 10px;
		width: 100%;
		flex: none;
		height: 44px;
		padding: 0 9px;
		margin-bottom: 8px;
		border: 1px solid var(--border-soft);
		border-radius: 11px;
		background: var(--surface-1);
		color: var(--text);
		cursor: pointer;
		text-align: left;
		transition: border-color 0.16s, background 0.16s;
	}
	.switcher:hover:not(:disabled), .switcher.open { border-color: var(--ember-line); background: var(--surface-2); }
	.switcher:disabled { opacity: 0.6; cursor: default; }
	.rail:not(.expanded) .switcher { width: 44px; padding: 0; justify-content: center; align-self: center; position: relative; }
	.cs-badge {
		flex: none; width: 26px; height: 26px; border-radius: 8px;
		display: grid; place-items: center;
		background: var(--ember-soft); color: var(--ember-bright);
		font-family: var(--font-display); font-weight: 600; font-size: 13px; line-height: 1;
	}
	.cs-badge.sm { width: 24px; height: 24px; font-size: 12px; }
	.cs-meta { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
	.cs-eyebrow { font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.12em; color: var(--text-faint); font-family: var(--font-mono); }
	.cs-name { font-size: 13.5px; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.cs-chev { width: 15px; height: 15px; flex: none; opacity: 0.6; color: var(--text-faint); transition: transform 0.2s var(--ease); }
	.cs-chev.open { transform: rotate(180deg); }
	/* Tooltip im Icon-Modus (wie .item .tip) */
	.switcher .tip {
		position: absolute;
		left: calc(100% + 12px);
		top: 50%;
		transform: translateY(-50%) translateX(-4px);
		background: var(--surface-3); color: var(--text);
		font-size: 12.5px; padding: 5px 10px; border-radius: 7px;
		white-space: nowrap; pointer-events: none; opacity: 0;
		transition: opacity 0.16s, transform 0.16s var(--ease);
		box-shadow: var(--shadow); z-index: 30;
	}
	.switcher:hover .tip { opacity: 1; transform: translateY(-50%) translateX(0); }

	/* Dropdown-Popover (fixed, dokument-weit) */
	.cs-backdrop { position: fixed; inset: 0; z-index: 95; background: transparent; border: none; cursor: default; }
	.cs-pop {
		position: fixed; z-index: 96;
		max-width: 280px;
		background: var(--surface-3);
		border: 1px solid var(--border);
		border-radius: 12px;
		box-shadow: var(--shadow);
		padding: 6px;
		display: flex; flex-direction: column; gap: 4px;
	}
	.cs-list { display: flex; flex-direction: column; gap: 2px; max-height: 280px; overflow-y: auto; scrollbar-width: thin; scrollbar-color: var(--border) transparent; }
	.cs-list::-webkit-scrollbar { width: 6px; }
	.cs-list::-webkit-scrollbar-thumb { background: var(--border); border-radius: 999px; }
	.cs-item {
		display: flex; align-items: center; gap: 9px;
		padding: 7px 9px; border-radius: 9px;
		background: transparent; border: none; cursor: pointer;
		color: var(--text-muted); text-align: left;
		transition: background 0.14s, color 0.14s;
	}
	.cs-item:hover { background: var(--surface-1); color: var(--text); }
	.cs-item.active { color: var(--text); }
	.cs-item-name { flex: 1; min-width: 0; font-size: 13.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.cs-check { width: 16px; height: 16px; flex: none; color: var(--ember-bright); }
	.cs-new {
		display: flex; align-items: center; gap: 8px;
		padding: 8px 9px; border-radius: 9px;
		background: transparent; border: none; cursor: pointer;
		color: var(--ember-bright); font: inherit; font-size: 13px; font-weight: 500;
		border-top: 1px solid var(--border-soft); margin-top: 2px; padding-top: 9px;
		transition: background 0.14s;
	}
	.cs-new:hover { background: var(--ember-soft); }
	.cs-new svg { width: 16px; height: 16px; flex: none; }

	/* Wizard-Modal */
	.wiz-overlay {
		position: fixed; inset: 0; z-index: 110;
		background: rgba(8, 6, 4, 0.66);
		backdrop-filter: blur(3px);
		display: grid; place-items: center;
		padding: 20px;
	}
	@media (max-width: 760px) { .wiz-overlay { padding: 0; } }

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

	/* Etagen-Header (nur ausgeklappt) — klickbar, klappt die Etage auf/zu. */
	.floor-header {
		display: flex;
		align-items: center;
		gap: 8px;
		width: 100%;
		padding: 6px 10px 5px;
		border: none;
		background: transparent;
		border-radius: 9px;
		color: var(--text-faint);
		font-size: 11px;
		font-family: var(--font-mono);
		text-transform: uppercase;
		letter-spacing: 0.1em;
		cursor: pointer;
		transition: color 0.16s, background 0.16s;
	}
	.floor-header:hover { color: var(--text-muted); background: var(--surface-1); }
	.floor-header.open { color: var(--text-muted); }
	.floor-ico { display: grid; place-items: center; opacity: 0.7; flex: none; }
	.floor-ico :global(svg) { width: 14px; height: 14px; }
	.floor-name { white-space: nowrap; }
	.floor-header .chev {
		width: 15px;
		height: 15px;
		margin-left: auto;
		flex: none;
		opacity: 0.6;
		transition: transform 0.22s var(--ease);
	}
	.floor-header .chev.open { transform: rotate(180deg); }

	/* Aufklapp-Container: weiche Höhen-Transition via grid-template-rows. */
	.floor-apps {
		display: grid;
		grid-template-rows: 0fr;
		transition: grid-template-rows 0.24s var(--ease);
	}
	.floor-apps.open { grid-template-rows: 1fr; }
	.floor-apps-inner {
		min-height: 0;
		overflow: hidden;
		display: flex;
		flex-direction: column;
		gap: 3px;
		padding: 0 0 1px;
	}
	@media (prefers-reduced-motion: reduce) {
		.floor-apps { transition: none; }
		.floor-header .chev { transition: none; }
	}

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
