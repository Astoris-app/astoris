<script lang="ts">
	import { onMount } from 'svelte';
	import AppHeader from '$lib/components/AppHeader.svelte';
	import { i18n } from '$lib/stores/i18n.svelte';

	type Level = 'info' | 'warn' | 'error';
	type LogEntry = { id: string; at: string; level: Level; source: string; message: string };

	let entries = $state<LogEntry[]>([]);
	let loading = $state(true);
	let busy = $state(false);
	let filter = $state<'all' | Level>('all');

	function apply(list: any) {
		entries = Array.isArray(list) ? list : [];
	}

	async function load() {
		try {
			const res = await fetch('/api/logs');
			const data = await res.json();
			apply(data?.entries ?? []);
		} catch {
			apply([]);
		}
	}

	async function clearAll() {
		if (busy) return;
		if (!confirm(i18n.t('logs.clearConfirm'))) return;
		busy = true;
		try {
			const res = await fetch('/api/logs', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ action: 'clear' })
			});
			if (res.ok) {
				const data = await res.json();
				apply(data?.entries ?? []);
			}
		} catch {
			/* offline ok */
		} finally {
			busy = false;
		}
	}

	onMount(async () => {
		await load();
		loading = false;
	});

	// ---------- Derived ----------
	let shown = $derived(filter === 'all' ? entries : entries.filter((e) => e.level === filter));
	const FILTERS: ('all' | Level)[] = ['all', 'info', 'warn', 'error'];
	function filterLabel(f: 'all' | Level): string {
		if (f === 'all') return i18n.t('logs.filterAll');
		return i18n.t('logs.level' + f.charAt(0).toUpperCase() + f.slice(1));
	}
	function levelLabel(l: Level): string {
		return i18n.t('logs.level' + l.charAt(0).toUpperCase() + l.slice(1));
	}

	// ---------- Time ----------
	function fmtTime(at?: string): string {
		if (!at) return '';
		const d = new Date(at);
		if (isNaN(d.getTime())) return '';
		return d.toLocaleString(i18n.lang === 'en' ? 'en-GB' : 'de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
	}
	// Relative time, falls back to date/time for older entries.
	function relTime(at?: string): string {
		if (!at) return '';
		const d = new Date(at);
		if (isNaN(d.getTime())) return '';
		const sec = Math.round((Date.now() - d.getTime()) / 1000);
		if (sec < 45) return i18n.t('logs.relNow');
		const min = Math.round(sec / 60);
		if (min < 60) return i18n.t('logs.relMin').replace('{n}', String(min));
		const hr = Math.round(min / 60);
		if (hr < 24) return i18n.t('logs.relHr').replace('{n}', String(hr));
		const day = Math.round(hr / 24);
		if (day <= 7) return i18n.t('logs.relDay').replace('{n}', String(day));
		return fmtTime(at);
	}
</script>

<AppHeader title={i18n.t('logs.title')} eyebrow={i18n.t('logs.eyebrow')}>
	{#if entries.length > 0}
		<button class="hdr-btn" onclick={clearAll} disabled={busy}>
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
				<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" />
			</svg>
			{i18n.t('logs.clear')}
		</button>
	{/if}
</AppHeader>

<div class="scroll">
	<p class="lead">{i18n.t('logs.lead')}</p>

	{#if loading}
		<p class="muted">{i18n.t('logs.loading')}</p>
	{:else if entries.length === 0}
		<div class="empty">
			<span class="big">📡</span>
			<h3>{i18n.t('logs.empty')}</h3>
			<p>{i18n.t('logs.emptyHint')}</p>
		</div>
	{:else}
		<div class="filters">
			{#each FILTERS as f (f)}
				<button class="fbtn" class:active={filter === f} onclick={() => (filter = f)}>{filterLabel(f)}</button>
			{/each}
		</div>

		{#if shown.length === 0}
			<p class="muted">{i18n.t('logs.empty')}</p>
		{:else}
			<div class="list">
				{#each shown as e (e.id)}
					<div class="row level-{e.level}">
						<span class="lvl level-{e.level}">{levelLabel(e.level)}</span>
						<div class="body">
							<span class="msg">{e.message}</span>
							<span class="src">{i18n.t('logs.source')}: {e.source}</span>
						</div>
						<span class="time" title={fmtTime(e.at)}>{relTime(e.at)}</span>
					</div>
				{/each}
			</div>
		{/if}
	{/if}
</div>

<style>
	.scroll { flex: 1; overflow-y: auto; padding: 24px 28px 48px; }
	.muted { color: var(--text-faint); }
	.lead { color: var(--text-muted); max-width: 620px; margin: 0 0 20px; }

	/* Header button */
	.hdr-btn { display: inline-flex; align-items: center; gap: 7px; font-size: 13px; color: var(--text-muted); border: 1px solid var(--border); border-radius: 9px; padding: 7px 12px; background: transparent; transition: all 0.16s; }
	.hdr-btn svg { width: 15px; height: 15px; }
	.hdr-btn:not(:disabled):hover { color: var(--danger); border-color: var(--danger-soft); background: var(--danger-soft); }
	.hdr-btn:disabled { opacity: 0.45; cursor: not-allowed; }

	/* Empty state */
	.empty { text-align: center; padding: 56px 20px; background: var(--surface-1); border: 1px dashed var(--border); border-radius: var(--radius-lg); display: flex; flex-direction: column; align-items: center; gap: 8px; }
	.empty .big { font-size: 38px; }
	.empty h3 { font-size: 16px; }
	.empty p { margin: 0; color: var(--text-muted); font-size: 13.5px; max-width: 440px; }

	/* Filters */
	.filters { display: flex; flex-wrap: wrap; gap: 7px; margin-bottom: 16px; }
	.fbtn { font-size: 12.5px; color: var(--text-muted); background: var(--surface-1); border: 1px solid var(--border-soft); border-radius: 8px; padding: 6px 13px; transition: all 0.14s; }
	.fbtn:hover { color: var(--text); border-color: var(--border); }
	.fbtn.active { color: var(--ember-bright); border-color: var(--ember-line); background: var(--ember-soft); }

	/* Log rows */
	.list { display: flex; flex-direction: column; gap: 7px; }
	.row { display: flex; align-items: flex-start; gap: 12px; background: var(--surface-1); border: 1px solid var(--border-soft); border-left-width: 3px; border-radius: var(--radius-sm); padding: 11px 14px; }
	.row.level-info { border-left-color: var(--sage); }
	.row.level-warn { border-left-color: var(--ember); }
	.row.level-error { border-left-color: var(--danger); }

	.lvl { flex: none; font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; font-family: var(--font-mono); padding: 3px 9px; border-radius: 999px; border: 1px solid var(--border-soft); color: var(--text-muted); background: var(--surface-2); white-space: nowrap; }
	.lvl.level-info { color: var(--sage); border-color: var(--border-soft); }
	.lvl.level-warn { color: var(--ember-bright); border-color: var(--ember-line); background: var(--ember-soft); }
	.lvl.level-error { color: var(--danger); border-color: var(--danger-soft); background: var(--danger-soft); }

	.body { display: flex; flex-direction: column; gap: 3px; flex: 1; min-width: 0; }
	.msg { font-size: 13.5px; color: var(--text); word-break: break-word; line-height: 1.45; }
	.src { font-size: 11px; color: var(--text-faint); font-family: var(--font-mono); }
	.time { flex: none; font-size: 11px; color: var(--text-faint); font-family: var(--font-mono); white-space: nowrap; padding-top: 2px; }

	@media (max-width: 640px) {
		.scroll { padding: 20px 16px 40px; }
		.row { flex-wrap: wrap; }
		.time { width: 100%; padding-top: 0; }
	}
</style>
