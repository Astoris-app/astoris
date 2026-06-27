<script lang="ts">
	import { onMount } from 'svelte';
	import AppHeader from '$lib/components/AppHeader.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { FLOORS, appsOnFloor, type AppDef } from '$lib/apps';
	import { i18n } from '$lib/stores/i18n.svelte';

	// ---------- Live-Status (read-only, aggregiert über /api/overview) ----------
	type Overview = {
		goals: { aktiv: number; gesamt: number; erledigt: number };
		agents: number;
		tasks: { offen: number; wartetFreigabe: number };
		leads: number;
		kunden: number;
		dealsOffen: number;
		kpis: number;
		experimente: { offen: number; gesamt: number };
	};

	let ov = $state<Overview | null>(null);
	let loading = $state(true);

	async function load() {
		try {
			const r = await fetch('/api/overview');
			if (r.ok) ov = await r.json();
		} catch { /* Übersicht bleibt ohne Live-Zahlen — Seite funktioniert trotzdem */ }
		loading = false;
	}
	onMount(load);

	// Etagen mit ihren Apps (Reihenfolge aus apps.ts).
	const floors = FLOORS.map((f) => ({ ...f, apps: appsOnFloor(f.id) })).filter((f) => f.apps.length > 0);

	// Live-Badge je App (nur wo sinnvoll & leicht zählbar).
	function badge(app: AppDef): { n: number; label: string } | null {
		if (!ov) return null;
		switch (app.id) {
			case 'firma': return { n: ov.goals.gesamt, label: i18n.t('uebersicht.unitGoals') };
			case 'agents': return { n: ov.agents, label: i18n.t('uebersicht.unitAgents') };
			case 'optimierung': return { n: ov.experimente.offen, label: i18n.t('uebersicht.unitExperiments') };
			case 'crm': return { n: ov.leads, label: i18n.t('uebersicht.unitLeads') };
			case 'metrics': return { n: ov.kpis, label: i18n.t('uebersicht.unitKpis') };
			default: return null;
		}
	}

	// Kurzbeschreibung je App (bilingual via dict).
	function desc(app: AppDef): string {
		const t = i18n.t('uebersicht.desc.' + app.id);
		// Fallback auf die (deutsche) Registry-Beschreibung, falls kein dict-Eintrag.
		return t === 'uebersicht.desc.' + app.id ? app.blurb : t;
	}
</script>

<AppHeader title={i18n.t('uebersicht.title')} eyebrow={i18n.t('uebersicht.eyebrow')} />

<div class="scroll">
	<!-- =============== Kennzahlen-Zeile (Heute) =============== -->
	<div class="today" class:loading>
		<span class="today-label">{i18n.t('uebersicht.today')}</span>
		{#if ov}
			<span class="today-stats">
				<span class="stat"><b>{ov.goals.aktiv}</b> {i18n.t('uebersicht.goalsActive')}</span>
				<span class="sep">·</span>
				<span class="stat"><b>{ov.leads}</b> {i18n.t('uebersicht.leads')}</span>
				<span class="sep">·</span>
				<span class="stat"><b>{ov.kpis}</b> {i18n.t('uebersicht.kpis')}</span>
				{#if ov.tasks.wartetFreigabe > 0}
					<span class="sep">·</span>
					<span class="stat alert"><b>{ov.tasks.wartetFreigabe}</b> {i18n.t('uebersicht.awaiting')}</span>
				{/if}
			</span>
		{:else}
			<span class="today-stats muted">{loading ? i18n.t('uebersicht.loading') : i18n.t('uebersicht.noStats')}</span>
		{/if}
	</div>

	<!-- =============== Etagen =============== -->
	{#each floors as floor (floor.id)}
		<section class="floor-block">
			<h2 class="floor-head">
				<span class="floor-ico"><Icon path={floor.icon} /></span>
				<span class="floor-name">{i18n.t(floor.labelKey)}</span>
			</h2>
			<div class="card-grid">
				{#each floor.apps as app (app.id)}
					{@const b = badge(app)}
					<a class="app-card" href={app.href}>
						<span class="card-ico"><Icon path={app.icon} /></span>
						<div class="card-main">
							<div class="card-top">
								<span class="card-name">{i18n.t('apps.' + app.id)}</span>
								{#if b}<span class="card-badge" class:zero={b.n === 0}>{b.n} {b.label}</span>{/if}
							</div>
							<span class="card-desc">{desc(app)}</span>
						</div>
						<span class="card-arrow" aria-hidden="true">
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>
						</span>
					</a>
				{/each}
			</div>
		</section>
	{/each}
</div>

<style>
	.scroll { flex: 1; overflow-y: auto; padding: 24px 28px 48px; }
	.muted { color: var(--text-faint); }

	/* Kennzahlen-Zeile */
	.today {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 10px 14px;
		background: var(--surface-1);
		border: 1px solid var(--border-soft);
		border-radius: var(--radius);
		padding: 14px 18px;
		margin-bottom: 30px;
	}
	.today.loading { opacity: 0.7; }
	.today-label {
		font-size: 12px;
		font-family: var(--font-mono);
		text-transform: uppercase;
		letter-spacing: 0.12em;
		color: var(--text-faint);
	}
	.today-stats { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; font-size: 14px; color: var(--text-muted); }
	.today-stats .stat b { color: var(--text); font-weight: 600; font-family: var(--font-display, var(--font-body)); }
	.today-stats .stat.alert b { color: var(--ember-bright); }
	.today-stats .sep { color: var(--text-faint); }

	/* Etagen */
	.floor-block { margin-bottom: 32px; }
	.floor-head {
		display: flex;
		align-items: center;
		gap: 10px;
		margin: 0 0 14px;
		font-size: 14px;
		font-family: var(--font-mono);
		text-transform: uppercase;
		letter-spacing: 0.1em;
		color: var(--text-muted);
	}
	.floor-head .floor-ico {
		display: grid;
		place-items: center;
		width: 30px;
		height: 30px;
		border-radius: 9px;
		background: var(--ember-soft);
		color: var(--ember-bright);
		flex: none;
	}
	.floor-head .floor-ico :global(svg) { width: 17px; height: 17px; }

	/* App-Karten */
	.card-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; }
	.app-card {
		display: flex;
		align-items: flex-start;
		gap: 13px;
		background: var(--surface-1);
		border: 1px solid var(--border-soft);
		border-radius: var(--radius);
		padding: 16px 16px;
		transition: border-color 0.18s, transform 0.18s var(--ease), background 0.18s;
	}
	.app-card:hover { transform: translateY(-2px); border-color: var(--ember-line); background: var(--surface-2); }
	.card-ico {
		display: grid;
		place-items: center;
		width: 40px;
		height: 40px;
		border-radius: 11px;
		background: var(--surface-2);
		border: 1px solid var(--border-soft);
		color: var(--text-muted);
		flex: none;
		transition: color 0.18s, border-color 0.18s;
	}
	.app-card:hover .card-ico { color: var(--ember-bright); border-color: var(--ember-line); }
	.card-ico :global(svg) { width: 21px; height: 21px; }
	.card-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
	.card-top { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
	.card-name { font-size: 15px; font-weight: 600; color: var(--text); }
	.card-badge {
		font-size: 11px;
		font-weight: 500;
		padding: 2px 9px;
		border-radius: 999px;
		color: var(--ember-bright);
		background: var(--ember-soft);
		border: 1px solid var(--ember-line);
		white-space: nowrap;
	}
	.card-badge.zero { color: var(--text-faint); background: var(--surface-2); border-color: var(--border-soft); }
	.card-desc { font-size: 12.5px; color: var(--text-muted); line-height: 1.45; }
	.card-arrow {
		display: grid;
		place-items: center;
		color: var(--text-faint);
		flex: none;
		opacity: 0;
		transform: translateX(-4px);
		transition: opacity 0.18s, transform 0.18s var(--ease), color 0.18s;
	}
	.card-arrow svg { width: 18px; height: 18px; }
	.app-card:hover .card-arrow { opacity: 1; transform: translateX(0); color: var(--ember-bright); }

	/* Mobile: Karten einspaltig. */
	@media (max-width: 760px) {
		.scroll { padding: 18px 16px 40px; }
		.card-grid { grid-template-columns: 1fr; }
		.card-arrow { display: none; }
	}
</style>
