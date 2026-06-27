<script lang="ts">
	import { onMount } from 'svelte';
	import AppHeader from '$lib/components/AppHeader.svelte';
	import { i18n } from '$lib/stores/i18n.svelte';

	// ---------- Types (read-only mirror of company.ts) ----------
	type TaskStatus = 'offen' | 'in-arbeit' | 'wartet-freigabe' | 'erledigt' | 'abgelehnt';
	type Task = {
		id: string;
		title: string;
		description?: string;
		agentId?: string;
		agentName?: string;
		goalId?: string;
		status: TaskStatus;
		createdAt: string;
	};
	type Goal = { id: string; title: string };
	type Company = { tasks?: Task[]; goals?: Goal[] };

	// ---------- State ----------
	let company = $state<Company>({ tasks: [], goals: [] });
	let loading = $state(true);
	// Guard against double-clicks on approve/reject.
	let rowBusy = $state<string | null>(null);

	function apply(c: any) {
		company = {
			tasks: Array.isArray(c?.tasks) ? c.tasks : [],
			goals: Array.isArray(c?.goals) ? c.goals : []
		};
	}

	async function load() {
		try {
			const res = await fetch('/api/company');
			const data = await res.json();
			apply(data?.company ?? {});
		} catch {
			apply({});
		}
	}

	async function setTaskStatus(id: string, status: TaskStatus) {
		if (rowBusy) return;
		rowBusy = id;
		try {
			const res = await fetch('/api/company', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ action: 'set-task-status', id, status })
			});
			if (res.ok) {
				const data = await res.json();
				if (data?.company) apply(data.company);
			}
		} catch {
			/* offline ok */
		} finally {
			rowBusy = null;
		}
	}

	onMount(async () => {
		await load();
		loading = false;
	});

	// ---------- Helpers ----------
	let pending = $derived((company.tasks ?? []).filter((t) => t.status === 'wartet-freigabe'));
	function goalTitle(id?: string): string {
		if (!id) return '';
		return (company.goals ?? []).find((g) => g.id === id)?.title ?? '';
	}
	function fmtDate(at?: string): string {
		if (!at) return '';
		const d = new Date(at);
		if (isNaN(d.getTime())) return '';
		return d.toLocaleDateString(i18n.lang === 'en' ? 'en-GB' : 'de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
	}
</script>

<AppHeader title={i18n.t('entscheidungen.title')} eyebrow={i18n.t('entscheidungen.eyebrow')}>
	<a class="hdr-link" href="/agents">
		<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
			<path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
		</svg>
		{i18n.t('entscheidungen.toTeam')}
	</a>
</AppHeader>

<div class="scroll">
	<p class="lead">{i18n.t('entscheidungen.lead')}</p>

	{#if loading}
		<p class="muted">{i18n.t('entscheidungen.loading')}</p>
	{:else if pending.length === 0}
		<div class="empty">
			<span class="big">✅</span>
			<h3>{i18n.t('entscheidungen.empty')}</h3>
			<p>{i18n.t('entscheidungen.emptyHint')}</p>
		</div>
	{:else}
		<div class="list">
			{#each pending as t (t.id)}
				<article class="card">
					<div class="card-top">
						<strong class="card-title">{t.title}</strong>
						<span class="badge">{i18n.t('entscheidungen.pending')}</span>
					</div>

					{#if t.description}
						<p class="desc">{t.description}</p>
					{/if}

					<div class="meta">
						<span class="chip" class:faint={!t.agentName}>
							<span class="chip-label">{i18n.t('entscheidungen.agentLabel')}</span>
							{t.agentName || i18n.t('entscheidungen.noAgent')}
						</span>
						{#if goalTitle(t.goalId)}
							<span class="chip">
								<span class="chip-label">{i18n.t('entscheidungen.goalLabel')}</span>
								{goalTitle(t.goalId)}
							</span>
						{/if}
						{#if t.createdAt}
							<span class="chip faint">{i18n.t('entscheidungen.created')} {fmtDate(t.createdAt)}</span>
						{/if}
					</div>

					<div class="actions">
						<button class="apv-btn approve" onclick={() => setTaskStatus(t.id, 'erledigt')} disabled={rowBusy === t.id}>
							{i18n.t('entscheidungen.approve')}
						</button>
						<button class="apv-btn reject" onclick={() => setTaskStatus(t.id, 'abgelehnt')} disabled={rowBusy === t.id}>
							{i18n.t('entscheidungen.reject')}
						</button>
					</div>
				</article>
			{/each}
		</div>
	{/if}
</div>

<style>
	.scroll { flex: 1; overflow-y: auto; padding: 24px 28px 48px; }
	.muted { color: var(--text-faint); }
	.lead { color: var(--text-muted); max-width: 620px; margin: 0 0 22px; }

	/* Header link */
	.hdr-link { display: inline-flex; align-items: center; gap: 7px; font-size: 13px; color: var(--text-muted); border: 1px solid var(--border); border-radius: 9px; padding: 7px 12px; transition: all 0.16s; }
	.hdr-link svg { width: 15px; height: 15px; }
	.hdr-link:hover { color: var(--text); border-color: var(--text-faint); }

	/* Empty state */
	.empty { text-align: center; padding: 56px 20px; background: var(--surface-1); border: 1px dashed var(--border); border-radius: var(--radius-lg); display: flex; flex-direction: column; align-items: center; gap: 8px; }
	.empty .big { font-size: 38px; }
	.empty h3 { font-size: 16px; }
	.empty p { margin: 0; color: var(--text-muted); font-size: 13.5px; max-width: 440px; }

	/* List of decisions */
	.list { display: flex; flex-direction: column; gap: 12px; max-width: 760px; }
	.card { background: var(--surface-1); border: 1px solid var(--border-soft); border-left: 3px solid var(--ember); border-radius: var(--radius); padding: 16px 18px; display: flex; flex-direction: column; gap: 11px; transition: border-color 0.18s; }
	.card:hover { border-color: var(--border); border-left-color: var(--ember-bright); }
	.card-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
	.card-title { font-size: 15px; font-weight: 600; word-break: break-word; }
	.badge { flex: none; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.06em; padding: 3px 9px; border-radius: 999px; color: var(--ember-bright); border: 1px solid var(--ember-line); background: var(--ember-soft); white-space: nowrap; }

	.desc { margin: 0; font-size: 13px; line-height: 1.5; color: var(--text-muted); }

	.meta { display: flex; flex-wrap: wrap; gap: 7px; }
	.chip { font-size: 11.5px; color: var(--text); background: var(--surface-2); border: 1px solid var(--border-soft); border-radius: 999px; padding: 3px 10px; display: inline-flex; align-items: center; gap: 6px; }
	.chip.faint { color: var(--text-faint); }
	.chip-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-faint); font-family: var(--font-mono); }

	.actions { display: flex; gap: 8px; margin-top: 2px; }
	.apv-btn { font-size: 12.5px; font-weight: 500; padding: 7px 16px; border-radius: 8px; border: 1px solid var(--border-soft); background: var(--surface-2); color: var(--text-muted); transition: all 0.14s; }
	.apv-btn:disabled { opacity: 0.45; cursor: not-allowed; }
	.apv-btn.approve { color: var(--sage); border-color: var(--sage); }
	.apv-btn.approve:not(:disabled):hover { background: var(--surface-3); }
	.apv-btn.reject:not(:disabled):hover { color: var(--danger); border-color: var(--danger-soft); background: var(--danger-soft); }

	@media (max-width: 640px) {
		.scroll { padding: 20px 16px 40px; }
		.card-top { flex-direction: column; }
		.badge { align-self: flex-start; }
	}
</style>
