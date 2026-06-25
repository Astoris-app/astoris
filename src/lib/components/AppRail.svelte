<script lang="ts">
	import { page } from '$app/state';
	import { APPS } from '$lib/apps';
	import { i18n } from '$lib/stores/i18n.svelte';
	import Icon from './Icon.svelte';
	import Brand from './Brand.svelte';
	import EngineStatus from './EngineStatus.svelte';

	let work = $derived(APPS.filter((a) => a.group === 'work'));
	let system = $derived(APPS.filter((a) => a.group === 'system'));
	let path = $derived(page.url.pathname);

	function isActive(href: string) {
		return href === '/' ? path === '/' : path.startsWith(href);
	}
</script>

<nav class="rail" aria-label="Bereiche">
	<a class="brand" href="/" title="Astoris">
		<Brand size={30} />
	</a>

	<div class="group">
		{#each work as app (app.id)}
			<a class="item" class:active={isActive(app.href)} href={app.href} title={i18n.t('apps.' + app.id)}>
				<Icon path={app.icon} />
				<span class="tip">{i18n.t('apps.' + app.id)}</span>
				{#if !app.ready}<span class="soon" aria-hidden="true"></span>{/if}
			</a>
		{/each}
	</div>

	<div class="spacer"></div>

	<div class="group">
		{#each system as app (app.id)}
			<a class="item" class:active={isActive(app.href)} href={app.href} title={i18n.t('apps.' + app.id)}>
				<Icon path={app.icon} />
				<span class="tip">{i18n.t('apps.' + app.id)}</span>
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
		padding: 14px 0 12px;
		gap: 6px;
	}
	.brand {
		display: grid;
		place-items: center;
		width: 44px;
		height: 44px;
		border-radius: 12px;
		margin-bottom: 8px;
		transition: transform 0.25s var(--ease);
	}
	.brand:hover {
		transform: rotate(-8deg) scale(1.05);
	}
	.group {
		display: flex;
		flex-direction: column;
		gap: 4px;
		width: 100%;
		align-items: center;
	}
	.spacer {
		flex: 1;
	}
	.item {
		position: relative;
		width: 44px;
		height: 44px;
		display: grid;
		place-items: center;
		border-radius: 12px;
		color: var(--text-muted);
		transition: color 0.18s, background 0.18s;
	}
	.item:hover {
		color: var(--text);
		background: var(--surface-1);
	}
	.item.active {
		color: var(--ember-bright);
		background: var(--ember-soft);
	}
	.item.active::before {
		content: '';
		position: absolute;
		left: -14px;
		top: 50%;
		transform: translateY(-50%);
		width: 3px;
		height: 22px;
		border-radius: 0 3px 3px 0;
		background: var(--ember);
	}
	.soon {
		position: absolute;
		top: 9px;
		right: 9px;
		width: 5px;
		height: 5px;
		border-radius: 50%;
		background: var(--text-faint);
	}
	/* Tooltip */
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
	.item:hover .tip {
		opacity: 1;
		transform: translateY(-50%) translateX(0);
	}
	.engine-wrap {
		width: 100%;
		display: grid;
		place-items: center;
		margin-top: 8px;
	}
	/* Auf der schmalen Rail nur der Puls-Punkt, Text ausblenden */
	.engine-wrap :global(.engine) {
		padding: 8px;
		border: none;
		background: transparent;
	}
	.engine-wrap :global(.meta) {
		display: none;
	}
</style>
