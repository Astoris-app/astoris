<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { APPS } from '$lib/apps';
	import { i18n } from '$lib/stores/i18n.svelte';
	import Icon from './Icon.svelte';
	import Brand from './Brand.svelte';
	import EngineStatus from './EngineStatus.svelte';

	let work = $derived(APPS.filter((a) => a.group === 'work'));
	let system = $derived(APPS.filter((a) => a.group === 'system'));
	let path = $derived(page.url.pathname);
	let expanded = $state(false);

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

<nav class="rail" class:expanded aria-label="Bereiche">
	<button class="toggle" onclick={toggle} title={expanded ? 'Menü einklappen' : 'Menü ausklappen'} aria-label="Menü ein-/ausklappen">
		<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
	</button>

	<a class="brand" href="/" title="Astoris">
		<Brand size={30} />
		{#if expanded}<span class="brand-name">Astoris</span>{/if}
	</a>

	<div class="group">
		{#each work as app (app.id)}
			<a class="item" class:active={isActive(app.href)} href={app.href} title={expanded ? '' : i18n.t('apps.' + app.id)}>
				<Icon path={app.icon} />
				{#if expanded}<span class="label">{i18n.t('apps.' + app.id)}</span>{:else}<span class="tip">{i18n.t('apps.' + app.id)}</span>{/if}
				{#if !app.ready}<span class="soon" aria-hidden="true"></span>{/if}
			</a>
		{/each}
	</div>

	<div class="spacer"></div>

	<div class="group">
		{#each system as app (app.id)}
			<a class="item" class:active={isActive(app.href)} href={app.href} title={expanded ? '' : i18n.t('apps.' + app.id)}>
				<Icon path={app.icon} />
				{#if expanded}<span class="label">{i18n.t('apps.' + app.id)}</span>{:else}<span class="tip">{i18n.t('apps.' + app.id)}</span>{/if}
			</a>
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
		transition: transform 0.25s var(--ease);
	}
	.rail:not(.expanded) .brand { width: 44px; justify-content: center; padding-left: 0; align-self: center; }
	.brand:hover { transform: scale(1.04); }
	.brand-name { font-family: var(--font-display); font-weight: 600; font-size: 17px; color: var(--text); letter-spacing: -0.01em; }
	.group { display: flex; flex-direction: column; gap: 3px; width: 100%; }
	.rail:not(.expanded) .group { align-items: center; }
	.spacer { flex: 1; }
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
	.engine-wrap { width: 100%; display: grid; place-items: center; margin-top: 8px; }
	.rail.expanded .engine-wrap { place-items: stretch; }
	.engine-wrap :global(.engine) { padding: 8px; border: none; background: transparent; }
	.rail:not(.expanded) .engine-wrap :global(.meta) { display: none; }
</style>
