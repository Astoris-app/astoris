<script lang="ts">
	import { i18n } from '$lib/stores/i18n.svelte';
	type Entry = { id: string; query: string; title?: string; at: string; favorite: boolean; resultCount?: number };
	let {
		history = [],
		activeQuery = '',
		mobileOpen = false,
		onSelect,
		onRename,
		onToggleFavorite,
		onDelete,
		onClear
	}: {
		history: Entry[];
		activeQuery?: string;
		mobileOpen?: boolean;
		onSelect: (query: string) => void;
		onRename: (id: string, title: string) => void;
		onToggleFavorite: (id: string, favorite: boolean) => void;
		onDelete: (id: string) => void;
		onClear: () => void;
	} = $props();

	let editing = $state<string | null>(null);
	let draft = $state('');

	function label(e: Entry): string {
		return e.title || e.query;
	}
	function startEdit(e: Entry) {
		editing = e.id;
		draft = e.title || e.query;
	}
	function commit(id: string) {
		onRename(id, draft.trim());
		editing = null;
	}

	function group(at: string): string {
		const d = new Date(at);
		const today = new Date();
		const diff = Math.floor((today.getTime() - d.getTime()) / 86400000);
		if (diff <= 0) return i18n.t('research.today');
		if (diff === 1) return i18n.t('research.yesterday');
		if (diff <= 7) return i18n.t('research.last7');
		if (diff <= 30) return i18n.t('research.last30');
		return i18n.t('research.older');
	}

	// Favoriten zuerst als eigene Gruppe, danach der Rest nach Zeit gruppiert.
	let grouped = $derived.by(() => {
		const favs = history.filter((e) => e.favorite);
		const rest = history.filter((e) => !e.favorite);
		const out: { label: string; star?: boolean; items: Entry[] }[] = [];
		if (favs.length) out.push({ label: i18n.t('research.favorites'), star: true, items: favs });
		for (const e of rest) {
			const g = group(e.at);
			let bucket = out.find((b) => b.label === g && !b.star);
			if (!bucket) { bucket = { label: g, items: [] }; out.push(bucket); }
			bucket.items.push(e);
		}
		return out;
	});
</script>

<aside class="sidebar" class:mobile-open={mobileOpen}>
	<div class="head">
		<span class="htitle">{i18n.t('research.historyTitle')}</span>
		{#if history.length}
			<button class="clear" onclick={onClear} title={i18n.t('research.clearHistory')} aria-label={i18n.t('research.clearHistory')}>
				<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"/></svg>
			</button>
		{/if}
	</div>

	<div class="list">
		{#if history.length === 0}
			<p class="empty">{i18n.t('research.noHistory')}</p>
		{:else}
			{#each grouped as g (g.label)}
				<div class="grp">{#if g.star}<span class="grp-star">★</span>{/if}{g.label}</div>
				{#each g.items as e (e.id)}
					<div class="item" class:active={e.query === activeQuery}>
						{#if editing === e.id}
							<input
								class="rename"
								bind:value={draft}
								onblur={() => commit(e.id)}
								onkeydown={(ev) => { if (ev.key === 'Enter') commit(e.id); if (ev.key === 'Escape') editing = null; }}
							/>
						{:else}
							<button
								class="star"
								class:on={e.favorite}
								onclick={() => onToggleFavorite(e.id, !e.favorite)}
								title={e.favorite ? i18n.t('research.unfavorite') : i18n.t('research.favorite')}
								aria-label={e.favorite ? i18n.t('research.unfavorite') : i18n.t('research.favorite')}
								aria-pressed={e.favorite}
							>
								{#if e.favorite}★{:else}☆{/if}
							</button>
							<button class="open" onclick={() => onSelect(e.query)} title={label(e)}>{label(e)}</button>
							<div class="acts">
								<button title={i18n.t('research.rename')} onclick={() => startEdit(e)} aria-label={i18n.t('research.rename')}>
									<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>
								</button>
								<button title={i18n.t('research.delete')} onclick={() => onDelete(e.id)} aria-label={i18n.t('research.delete')}>
									<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"/></svg>
								</button>
							</div>
						{/if}
					</div>
				{/each}
			{/each}
		{/if}
	</div>
</aside>

<style>
	.sidebar { width: 248px; flex: none; height: 100%; background: var(--bg-veil); border-right: 1px solid var(--border-soft); display: flex; flex-direction: column; padding: 12px 10px; }
	.head { display: flex; align-items: center; justify-content: space-between; padding: 4px 6px 2px; }
	.htitle { font-size: 11px; font-family: var(--font-mono); text-transform: uppercase; letter-spacing: 0.1em; color: var(--text-faint); }
	.clear { width: 26px; height: 26px; display: grid; place-items: center; border-radius: 6px; color: var(--text-faint); background: none; border: none; transition: all 0.14s; }
	.clear:hover { color: var(--text); background: var(--surface-3); }
	.list { flex: 1; overflow-y: auto; margin-top: 8px; }
	.empty { color: var(--text-faint); font-size: 12.5px; text-align: center; margin-top: 20px; }
	.grp { font-size: 10.5px; font-family: var(--font-mono); text-transform: uppercase; letter-spacing: 0.1em; color: var(--text-faint); margin: 14px 6px 6px; display: flex; align-items: center; gap: 5px; }
	.grp-star { color: var(--ember-bright); font-size: 11px; }
	.item { display: flex; align-items: center; border-radius: 8px; transition: background 0.14s; }
	.item:hover { background: var(--surface-1); }
	.item.active { background: var(--surface-2); }
	.star { flex: none; width: 26px; height: 30px; display: grid; place-items: center; background: none; border: none; color: var(--text-faint); font-size: 14px; line-height: 1; transition: color 0.14s; }
	.star:hover { color: var(--ember-bright); }
	.star.on { color: var(--ember-bright); }
	.open { flex: 1; text-align: left; background: none; border: none; color: var(--text-muted); font-size: 13px; padding: 9px 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.item.active .open, .item:hover .open { color: var(--text); }
	.acts { display: none; gap: 1px; padding-right: 4px; }
	.item:hover .acts { display: flex; }
	.acts button { width: 26px; height: 26px; display: grid; place-items: center; border-radius: 6px; color: var(--text-faint); background: none; border: none; transition: all 0.14s; }
	.acts button:hover { color: var(--text); background: var(--surface-3); }
	.rename { flex: 1; background: var(--bg); border: 1px solid var(--ember-line); border-radius: 7px; color: var(--text); padding: 7px 9px; font-size: 13px; font-family: var(--font-body); margin: 2px; }
	.rename:focus { outline: none; }

	/* --- Mobile: Recherche-Historie als Off-Canvas-Drawer (≤ 760px). Desktop unverändert. --- */
	@media (max-width: 760px) {
		.sidebar {
			position: fixed;
			top: 0;
			left: 0;
			bottom: 0;
			height: 100vh;
			width: 270px;
			max-width: 84vw;
			z-index: 90;
			transform: translateX(-100%);
			transition: transform 0.24s var(--ease);
			box-shadow: var(--shadow);
		}
		.sidebar.mobile-open { transform: translateX(0); }
	}
</style>
