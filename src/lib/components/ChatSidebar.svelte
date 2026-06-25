<script lang="ts">
	import { i18n } from '$lib/stores/i18n.svelte';
	type Summary = { id: string; title: string; updatedAt: string; count: number };
	let {
		chats = [],
		currentId = null,
		onOpen,
		onNew,
		onRename,
		onDelete
	}: {
		chats: Summary[];
		currentId: string | null;
		onOpen: (id: string) => void;
		onNew: () => void;
		onRename: (id: string, title: string) => void;
		onDelete: (id: string) => void;
	} = $props();

	let editing = $state<string | null>(null);
	let draft = $state('');

	function startEdit(c: Summary) {
		editing = c.id;
		draft = c.title;
	}
	function commit(id: string) {
		if (draft.trim()) onRename(id, draft.trim());
		editing = null;
	}

	function group(updatedAt: string): string {
		const d = new Date(updatedAt);
		const today = new Date();
		const diff = Math.floor((today.getTime() - d.getTime()) / 86400000);
		if (diff <= 0) return i18n.t('chat.today');
		if (diff === 1) return i18n.t('chat.yesterday');
		if (diff <= 7) return i18n.t('chat.last7');
		if (diff <= 30) return i18n.t('chat.last30');
		return i18n.t('chat.older');
	}
	let grouped = $derived.by(() => {
		const out: { label: string; items: Summary[] }[] = [];
		for (const c of chats) {
			const g = group(c.updatedAt);
			let bucket = out.find((b) => b.label === g);
			if (!bucket) { bucket = { label: g, items: [] }; out.push(bucket); }
			bucket.items.push(c);
		}
		return out;
	});
</script>

<aside class="sidebar">
	<button class="new" onclick={onNew}>
		<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>
		{i18n.t('chat.newChat')}
	</button>

	<div class="list">
		{#if chats.length === 0}
			<p class="empty">{i18n.t('chat.noChats')}</p>
		{:else}
			{#each grouped as g (g.label)}
				<div class="grp">{g.label}</div>
				{#each g.items as c (c.id)}
					<div class="item" class:active={c.id === currentId}>
						{#if editing === c.id}
							<input
								class="rename"
								bind:value={draft}
								onblur={() => commit(c.id)}
								onkeydown={(e) => { if (e.key === 'Enter') commit(c.id); if (e.key === 'Escape') editing = null; }}
							/>
						{:else}
							<button class="open" onclick={() => onOpen(c.id)} title={c.title}>{c.title}</button>
							<div class="acts">
								<button title={i18n.t('chat.rename')} onclick={() => startEdit(c)} aria-label={i18n.t('chat.rename')}>
									<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>
								</button>
								<button title={i18n.t('chat.delete')} onclick={() => onDelete(c.id)} aria-label={i18n.t('chat.delete')}>
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
	.new { display: flex; align-items: center; justify-content: center; gap: 8px; width: 100%; background: var(--ember-soft); color: var(--ember-bright); border: 1px solid var(--ember-line); border-radius: 10px; padding: 10px; font-size: 13.5px; font-weight: 500; transition: all 0.16s; }
	.new:hover { background: var(--ember); color: #1a1206; }
	.list { flex: 1; overflow-y: auto; margin-top: 12px; }
	.empty { color: var(--text-faint); font-size: 12.5px; text-align: center; margin-top: 20px; }
	.grp { font-size: 10.5px; font-family: var(--font-mono); text-transform: uppercase; letter-spacing: 0.1em; color: var(--text-faint); margin: 14px 6px 6px; }
	.item { display: flex; align-items: center; border-radius: 8px; transition: background 0.14s; }
	.item:hover { background: var(--surface-1); }
	.item.active { background: var(--surface-2); }
	.open { flex: 1; text-align: left; background: none; border: none; color: var(--text-muted); font-size: 13px; padding: 9px 10px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.item.active .open, .item:hover .open { color: var(--text); }
	.acts { display: none; gap: 1px; padding-right: 4px; }
	.item:hover .acts { display: flex; }
	.acts button { width: 26px; height: 26px; display: grid; place-items: center; border-radius: 6px; color: var(--text-faint); background: none; border: none; transition: all 0.14s; }
	.acts button:hover { color: var(--text); background: var(--surface-3); }
	.rename { flex: 1; background: var(--bg); border: 1px solid var(--ember-line); border-radius: 7px; color: var(--text); padding: 7px 9px; font-size: 13px; font-family: var(--font-body); margin: 2px; }
	.rename:focus { outline: none; }
</style>
