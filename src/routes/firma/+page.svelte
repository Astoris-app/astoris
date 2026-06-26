<script lang="ts">
	import { onMount } from 'svelte';
	import AppHeader from '$lib/components/AppHeader.svelte';
	import { i18n } from '$lib/stores/i18n.svelte';

	// ---------- Types (read-only mirror of company.ts) ----------
	type HistoryEntry = { task: string; result: string; at: string };
	type Agent = {
		id: string;
		name: string;
		role: string;
		personaId: string;
		status: string;
		history?: HistoryEntry[];
	};
	type GoalMetric = { name: string; target: number; current: number; unit: string };
	type Goal = {
		id: string;
		title: string;
		description?: string;
		parentId?: string | null;
		status: 'geplant' | 'aktiv' | 'blockiert' | 'erledigt';
		metric?: GoalMetric;
		deadline?: string;
		priority: 'hoch' | 'mittel' | 'niedrig';
		agentIds: string[];
		createdAt: string;
	};
	type Company = { name: string; industry: string; mission: string; agents: Agent[]; goals?: Goal[] };

	// ---------- State ----------
	let company = $state<Company>({ name: '', industry: '', mission: '', agents: [], goals: [] });
	let loading = $state(true);

	// ---------- Loader (read-only via /api/company) ----------
	async function loadCompany() {
		try {
			const res = await fetch('/api/company');
			const data = await res.json();
			const c = data?.company ?? {};
			company = {
				name: c.name ?? '',
				industry: c.industry ?? '',
				mission: c.mission ?? '',
				agents: Array.isArray(c.agents) ? c.agents : [],
				goals: Array.isArray(c.goals) ? c.goals : []
			};
		} catch {
			company = { name: '', industry: '', mission: '', agents: [], goals: [] };
		}
	}
	onMount(async () => {
		await loadCompany();
		loading = false;
	});

	// ---------- Helpers ----------
	function progressPct(m?: GoalMetric): number {
		if (!m || !(m.target > 0)) return 0;
		return Math.max(0, Math.min(100, Math.round((m.current / m.target) * 100)));
	}
	function statusLabel(s: Goal['status']): string {
		return i18n.t('agents.status' + s.charAt(0).toUpperCase() + s.slice(1));
	}
	function fmtDate(d?: string): string {
		if (!d) return '';
		const dt = new Date(d);
		if (isNaN(dt.getTime())) return d;
		return dt.toLocaleDateString(i18n.lang === 'en' ? 'en-GB' : 'de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
	}
	function fmtTime(at?: string): string {
		if (!at) return '';
		const d = new Date(at);
		if (isNaN(d.getTime())) return at;
		return d.toLocaleString(i18n.lang === 'en' ? 'en-GB' : 'de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
	}
	function daysUntil(d?: string): number | null {
		if (!d) return null;
		const dt = new Date(d);
		if (isNaN(dt.getTime())) return null;
		dt.setHours(0, 0, 0, 0);
		const t = new Date();
		t.setHours(0, 0, 0, 0);
		return Math.round((dt.getTime() - t.getTime()) / 86400000);
	}
	function isDueSoon(g: Goal): boolean {
		if (g.status === 'erledigt') return false;
		const n = daysUntil(g.deadline);
		return n !== null && n <= 7; // includes overdue (negative)
	}
	function dueText(d?: string): string {
		const n = daysUntil(d);
		if (n === null) return '';
		if (n < 0) return i18n.t('firma.overdue').replace('{n}', String(-n));
		if (n === 0) return i18n.t('firma.dueToday');
		if (n === 1) return i18n.t('firma.dueTomorrow');
		return i18n.t('firma.dueIn').replace('{n}', String(n));
	}
	function latestTask(a: Agent): HistoryEntry | null {
		// history is stored newest-first (server prepends).
		return Array.isArray(a.history) && a.history.length ? a.history[0] : null;
	}
	function agentNamesFor(ids: string[]): string[] {
		return (ids ?? []).map((id) => company.agents.find((a) => a.id === id)?.name).filter(Boolean) as string[];
	}

	// ---------- Derived: data presence + KPIs ----------
	let allGoals = $derived(company.goals ?? []);
	let mainGoals = $derived(allGoals.filter((g) => !g.parentId));
	let hasData = $derived(allGoals.length > 0 || company.agents.length > 0);

	let totalGoals = $derived(allGoals.length);
	let activeGoals = $derived(allGoals.filter((g) => g.status === 'aktiv').length);
	let doneGoals = $derived(allGoals.filter((g) => g.status === 'erledigt').length);
	let withMetric = $derived(allGoals.filter((g) => g.metric && g.metric.target > 0));
	let overallProgress = $derived(
		withMetric.length ? Math.round(withMetric.reduce((s, g) => s + progressPct(g.metric), 0) / withMetric.length) : 0
	);
	let agentCount = $derived(company.agents.length);

	function subCount(id: string): number {
		return allGoals.filter((g) => g.parentId === id).length;
	}

	// ---------- Derived: Handlungsbedarf (what's important) ----------
	type Action = { kind: 'blocked' | 'due' | 'noAgent' | 'noMetric'; goal: Goal };
	let actions = $derived.by<Action[]>(() => {
		const open = allGoals.filter((g) => g.status !== 'erledigt');
		const list: Action[] = [];
		for (const g of open) if (g.status === 'blockiert') list.push({ kind: 'blocked', goal: g });
		for (const g of open) if (isDueSoon(g)) list.push({ kind: 'due', goal: g });
		for (const g of open) if (!g.agentIds || g.agentIds.length === 0) list.push({ kind: 'noAgent', goal: g });
		for (const g of open) if (!g.metric || !(g.metric.target > 0)) list.push({ kind: 'noMetric', goal: g });
		return list;
	});
	function actionLabel(kind: Action['kind']): string {
		return i18n.t('firma.cat' + kind.charAt(0).toUpperCase() + kind.slice(1));
	}
</script>

<AppHeader title={i18n.t('firma.title')} eyebrow={i18n.t('firma.eyebrow')}>
	<a class="hdr-link" href="/agents">
		<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
			<path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
		</svg>
		{i18n.t('firma.edit')}
	</a>
</AppHeader>

<div class="scroll">
	{#if loading}
		<p class="muted">{i18n.t('firma.loading')}</p>
	{:else if !hasData}
		<div class="empty">
			<span class="big">🛰️</span>
			<h3>{i18n.t('firma.emptyTitle')}</h3>
			<p>{i18n.t('firma.emptyHint')}</p>
			<a class="btn primary" href="/agents">{i18n.t('firma.emptyCta')}</a>
		</div>
	{:else}
		<!-- =============== KPIs =============== -->
		<div class="kpis">
			<div class="kpi">
				<span class="kpi-val">{totalGoals}</span>
				<span class="kpi-label">{i18n.t('firma.kpiGoals')}</span>
			</div>
			<div class="kpi">
				<span class="kpi-val ember">{activeGoals}</span>
				<span class="kpi-label">{i18n.t('firma.kpiActive')}</span>
			</div>
			<div class="kpi">
				<span class="kpi-val sage">{doneGoals}</span>
				<span class="kpi-label">{i18n.t('firma.kpiDone')}</span>
			</div>
			<div class="kpi wide">
				<span class="kpi-val">{overallProgress}%</span>
				<span class="kpi-label">{i18n.t('firma.kpiProgress')}</span>
				<div class="kpi-track"><div class="kpi-fill" style="width:{overallProgress}%"></div></div>
			</div>
			<div class="kpi">
				<span class="kpi-val">{agentCount}</span>
				<span class="kpi-label">{i18n.t('firma.kpiAgents')}</span>
			</div>
		</div>

		<!-- =============== Was ist wichtig =============== -->
		<section class="block">
			<h2 class="cat">{i18n.t('firma.importantTitle')}</h2>
			{#if actions.length === 0}
				<div class="ok-note">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
						<path d="M20 6 9 17l-5-5" />
					</svg>
					<span>{i18n.t('firma.importantEmpty')}</span>
				</div>
			{:else}
				<div class="action-list">
					{#each actions as a, i (a.kind + a.goal.id + i)}
						<div class="action-row kind-{a.kind}">
							<span class="action-chip kind-{a.kind}">{actionLabel(a.kind)}</span>
							<span class="action-title">{a.goal.title}</span>
							{#if a.kind === 'due' && a.goal.deadline}
								<span class="action-detail">{dueText(a.goal.deadline)}</span>
							{/if}
						</div>
					{/each}
				</div>
			{/if}
		</section>

		<!-- =============== Ziele-Überblick =============== -->
		<section class="block">
			<h2 class="cat">{i18n.t('firma.goalsTitle')}</h2>
			{#if mainGoals.length === 0}
				<div class="empty small">
					<span class="big">🎯</span>
					<p>{i18n.t('firma.goalsEmpty')}</p>
				</div>
			{:else}
				<div class="goal-grid">
					{#each mainGoals as g (g.id)}
						{@const pct = progressPct(g.metric)}
						{@const dueSoon = isDueSoon(g)}
						{@const subs = subCount(g.id)}
						<article
							class="goal-card"
							class:done={g.status === 'erledigt'}
							class:alert-blocked={g.status === 'blockiert'}
							class:alert-due={dueSoon && g.status !== 'blockiert'}
						>
							<div class="goal-top">
								<div class="goal-title-wrap">
									<span class="prio-dot" class:hoch={g.priority === 'hoch'} class:mittel={g.priority === 'mittel'} class:niedrig={g.priority === 'niedrig'}></span>
									<strong class="goal-title">{g.title}</strong>
								</div>
								<span class="sbadge status-{g.status}">{statusLabel(g.status)}</span>
							</div>

							{#if g.metric && (g.metric.target > 0 || g.metric.current > 0)}
								<div class="goal-metric">
									<div class="metric-row">
										<span class="metric-name">{g.metric.name || i18n.t('agents.goalProgress')}</span>
										<span class="metric-val">{g.metric.current} / {g.metric.target} {g.metric.unit} · {pct}%</span>
									</div>
									<div class="progress-track"><div class="progress-fill" style="width:{pct}%"></div></div>
								</div>
							{:else}
								<span class="no-metric">{i18n.t('firma.noMetric')}</span>
							{/if}

							<div class="goal-meta">
								{#if g.deadline}
									<span class="meta-chip" class:warn={dueSoon}>
										{fmtDate(g.deadline)}{#if dueSoon} · {dueText(g.deadline)}{/if}
									</span>
								{:else}
									<span class="meta-chip faint">{i18n.t('firma.noDeadline')}</span>
								{/if}
								{#if subs > 0}<span class="meta-chip">{subs} {i18n.t('agents.goalSubgoals')}</span>{/if}
								{#each agentNamesFor(g.agentIds) as n (n)}<span class="meta-chip agent">{n}</span>{/each}
							</div>
						</article>
					{/each}
				</div>
			{/if}
		</section>

		<!-- =============== Agenten-Aktivität =============== -->
		<section class="block">
			<h2 class="cat">{i18n.t('firma.agentsTitle')}</h2>
			{#if company.agents.length === 0}
				<div class="empty small">
					<span class="big">🤝</span>
					<p>{i18n.t('firma.agentsEmpty')}</p>
				</div>
			{:else}
				<div class="agent-list">
					{#each company.agents as a (a.id)}
						{@const last = latestTask(a)}
						<div class="agent-row" class:inactive={!last}>
							<span class="status-dot" class:online={a.status === 'active' || a.status === 'online'}></span>
							<div class="agent-main">
								<div class="agent-head">
									<strong>{a.name}</strong>
									{#if a.role}<span class="agent-role">{a.role}</span>{/if}
								</div>
								{#if last}
									<span class="agent-task">{last.task}</span>
								{:else}
									<span class="agent-task faint">{i18n.t('firma.noActivity')}</span>
								{/if}
							</div>
							{#if last}<span class="agent-time">{fmtTime(last.at)}</span>{/if}
						</div>
					{/each}
				</div>
			{/if}
		</section>
	{/if}
</div>

<style>
	.scroll { flex: 1; overflow-y: auto; padding: 24px 28px 48px; }
	.muted { color: var(--text-faint); }
	.cat { font-size: 13px; font-family: var(--font-mono); text-transform: uppercase; letter-spacing: 0.12em; color: var(--text-faint); margin: 0 0 14px; }

	/* Header link */
	.hdr-link { display: inline-flex; align-items: center; gap: 7px; font-size: 13px; color: var(--text-muted); border: 1px solid var(--border); border-radius: 9px; padding: 7px 12px; transition: all 0.16s; }
	.hdr-link svg { width: 15px; height: 15px; }
	.hdr-link:hover { color: var(--text); border-color: var(--text-faint); }

	/* Buttons (shared) */
	.btn { display: inline-flex; align-items: center; gap: 7px; border-radius: 9px; padding: 8px 14px; font-size: 13px; font-weight: 500; border: 1px solid transparent; transition: all 0.16s; }
	.btn.primary { background: var(--ember); color: #1a1206; }
	.btn.primary:hover { background: var(--ember-bright); }

	/* Empty states */
	.empty { text-align: center; padding: 56px 20px; background: var(--surface-1); border: 1px dashed var(--border); border-radius: var(--radius-lg); display: flex; flex-direction: column; align-items: center; gap: 8px; }
	.empty.small { padding: 28px 20px; }
	.empty .big { font-size: 38px; }
	.empty h3 { font-size: 16px; }
	.empty p { margin: 0; color: var(--text-muted); font-size: 13.5px; max-width: 440px; }
	.empty .btn { margin-top: 10px; }

	/* KPIs */
	.kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 12px; margin-bottom: 30px; }
	.kpi { background: var(--surface-1); border: 1px solid var(--border-soft); border-radius: var(--radius); padding: 16px 18px; display: flex; flex-direction: column; gap: 4px; }
	.kpi.wide { grid-column: span 2; }
	.kpi-val { font-size: 28px; font-weight: 600; font-family: var(--font-display, var(--font-body)); line-height: 1.05; letter-spacing: -0.02em; }
	.kpi-val.ember { color: var(--ember-bright); }
	.kpi-val.sage { color: var(--sage); }
	.kpi-label { font-size: 12px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.06em; }
	.kpi-track { height: 6px; border-radius: 999px; background: var(--surface-3); overflow: hidden; margin-top: 8px; }
	.kpi-fill { height: 100%; background: var(--ember); border-radius: 999px; transition: width 0.4s var(--ease); }

	.block { margin-bottom: 30px; }

	/* Handlungsbedarf */
	.ok-note { display: flex; align-items: center; gap: 10px; background: var(--surface-1); border: 1px solid var(--border-soft); border-radius: var(--radius); padding: 14px 16px; color: var(--text-muted); font-size: 13.5px; }
	.ok-note svg { width: 18px; height: 18px; color: var(--sage); flex: none; }
	.action-list { display: flex; flex-direction: column; gap: 8px; }
	.action-row { display: flex; align-items: center; gap: 12px; background: var(--surface-1); border: 1px solid var(--border-soft); border-left-width: 3px; border-radius: var(--radius-sm); padding: 11px 14px; }
	.action-row.kind-blocked { border-left-color: var(--danger); }
	.action-row.kind-due { border-left-color: var(--ember); }
	.action-row.kind-noAgent { border-left-color: var(--text-faint); }
	.action-row.kind-noMetric { border-left-color: var(--text-faint); }
	.action-chip { font-size: 11px; font-weight: 500; padding: 3px 9px; border-radius: 999px; flex: none; border: 1px solid var(--border-soft); color: var(--text-muted); background: var(--surface-2); }
	.action-chip.kind-blocked { color: var(--danger); border-color: var(--danger-soft); background: var(--danger-soft); }
	.action-chip.kind-due { color: var(--ember-bright); border-color: var(--ember-line); background: var(--ember-soft); }
	.action-title { font-size: 13.5px; font-weight: 600; flex: 1; min-width: 0; word-break: break-word; }
	.action-detail { font-size: 11.5px; color: var(--text-faint); font-family: var(--font-mono); flex: none; }

	/* Goals */
	.goal-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; }
	.goal-card { background: var(--surface-1); border: 1px solid var(--border-soft); border-radius: var(--radius); padding: 14px 16px; display: flex; flex-direction: column; gap: 11px; transition: border-color 0.18s, transform 0.18s var(--ease); }
	.goal-card:hover { transform: translateY(-2px); border-color: var(--border); }
	.goal-card.alert-blocked { border-color: var(--danger-soft); box-shadow: inset 3px 0 0 var(--danger); }
	.goal-card.alert-due { box-shadow: inset 3px 0 0 var(--ember); }
	.goal-card.done { opacity: 0.65; }
	.goal-card.done .goal-title { text-decoration: line-through; }
	.goal-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
	.goal-title-wrap { display: flex; align-items: center; gap: 9px; min-width: 0; flex: 1; }
	.goal-title { font-size: 14.5px; font-weight: 600; word-break: break-word; }
	.prio-dot { width: 9px; height: 9px; border-radius: 50%; flex: none; background: var(--text-faint); }
	.prio-dot.hoch { background: var(--danger); }
	.prio-dot.mittel { background: var(--ember); }
	.prio-dot.niedrig { background: var(--sage); }
	.sbadge { flex: none; font-size: 11px; padding: 3px 10px; border-radius: 999px; border: 1px solid var(--border-soft); color: var(--text-muted); background: var(--surface-2); }
	.sbadge.status-aktiv { color: var(--ember-bright); border-color: var(--ember-line); background: var(--ember-soft); }
	.sbadge.status-blockiert { color: var(--danger); border-color: var(--danger-soft); background: var(--danger-soft); }
	.sbadge.status-erledigt { color: var(--sage); border-color: var(--sage); }
	.goal-metric { display: flex; flex-direction: column; gap: 5px; }
	.metric-row { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
	.metric-name { font-size: 12px; color: var(--text-muted); }
	.metric-val { font-size: 11.5px; color: var(--text-faint); font-family: var(--font-mono); }
	.progress-track { height: 7px; border-radius: 999px; background: var(--surface-3); overflow: hidden; }
	.progress-fill { height: 100%; background: var(--ember); border-radius: 999px; transition: width 0.3s var(--ease); }
	.no-metric { font-size: 11.5px; color: var(--text-faint); font-style: italic; }
	.goal-meta { display: flex; flex-wrap: wrap; gap: 6px; }
	.meta-chip { font-size: 11px; color: var(--text-muted); background: var(--surface-2); border: 1px solid var(--border-soft); border-radius: 999px; padding: 3px 9px; }
	.meta-chip.agent { color: var(--text); }
	.meta-chip.faint { color: var(--text-faint); }
	.meta-chip.warn { color: var(--ember-bright); border-color: var(--ember-line); }

	/* Agents */
	.agent-list { display: flex; flex-direction: column; gap: 8px; }
	.agent-row { display: flex; align-items: center; gap: 12px; background: var(--surface-1); border: 1px solid var(--border-soft); border-radius: var(--radius-sm); padding: 12px 14px; }
	.agent-row.inactive { opacity: 0.78; }
	.status-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--text-faint); flex: none; }
	.status-dot.online { background: var(--sage); }
	.agent-main { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
	.agent-head { display: flex; align-items: baseline; gap: 8px; }
	.agent-head strong { font-size: 14px; font-weight: 600; }
	.agent-role { font-size: 12px; color: var(--text-faint); }
	.agent-task { font-size: 12.5px; color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.agent-task.faint { color: var(--text-faint); font-style: italic; }
	.agent-time { font-size: 11px; color: var(--text-faint); font-family: var(--font-mono); flex: none; }

	@media (max-width: 640px) {
		.scroll { padding: 20px 16px 40px; }
		.kpi.wide { grid-column: span 2; }
		.goal-top { flex-direction: column; }
		.sbadge { align-self: flex-start; }
	}
</style>
