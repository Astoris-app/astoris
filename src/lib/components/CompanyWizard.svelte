<script lang="ts">
	// Mehrstufiger Assistent zum Anlegen einer neuen Firma.
	// Wiederverwendbar: Company-Switcher (Modal) UND später /welcome.
	// Props: onDone() nach erfolgreichem Anlegen, onCancel() bei Abbruch.
	import { onMount } from 'svelte';
	import { i18n } from '$lib/stores/i18n.svelte';
	import { dictation } from '$lib/actions/dictation';

	// mode: 'create' legt eine NEUE Firma an (Switcher) — 'setup' befüllt die bereits aktive
	// (erste/leere) Firma in der Ersteinrichtung. embedded: ohne eigenen Card/Modal-Rahmen
	// rendern, damit der Wizard als Schritt in /welcome eingebettet werden kann.
	let {
		onDone = () => {},
		onCancel = () => {},
		mode = 'create',
		embedded = false
	}: {
		onDone?: () => void;
		onCancel?: () => void;
		mode?: 'create' | 'setup';
		embedded?: boolean;
	} = $props();

	type Tpl = { label: string; roles: { title: string; description: string }[] };

	let templates = $state<Record<string, Tpl>>({});
	let step = $state(1);
	const TOTAL = 4;

	// Formulardaten
	let name = $state('');
	let industry = $state('');
	let mission = $state('');
	let knowledge = $state('');
	let goals = $state<string[]>(['']);
	let useTemplate = $state(true);

	let submitting = $state(false);
	let error = $state('');

	let activeTpl = $derived(industry ? templates[industry] : undefined);
	let templateKeys = $derived(Object.keys(templates));
	// Branchen-Vorlage nur sinnvoll, wenn eine Branche mit Rollen gewählt ist.
	let canTemplate = $derived(!!activeTpl);

	onMount(async () => {
		try {
			const r = await fetch('/api/company');
			if (r.ok) {
				const d = await r.json();
				if (d?.templates) templates = d.templates;
			}
		} catch { /* templates optional — Wizard funktioniert auch ohne */ }
	});

	function lang(): 'de-DE' | 'en-US' { return i18n.lang === 'en' ? 'en-US' : 'de-DE'; }

	// Schritt 1 braucht einen Namen; alle anderen sind frei weiterklickbar.
	let canNext = $derived(step !== 1 || name.trim().length > 0);

	function next() {
		error = '';
		if (step < TOTAL) step += 1;
	}
	function back() {
		error = '';
		if (step > 1) step -= 1;
	}

	function addGoal() {
		if (goals.length < 3) goals = [...goals, ''];
	}
	function removeGoal(i: number) {
		goals = goals.filter((_, idx) => idx !== i);
		if (goals.length === 0) goals = [''];
	}

	async function finish() {
		if (!name.trim() || submitting) return;
		submitting = true;
		error = '';
		try {
			const cleanGoals = goals.map((g) => g.trim()).filter(Boolean);
			const r = await fetch('/api/companies', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					action: mode === 'setup' ? 'setup-active' : 'create',
					name: name.trim(),
					industry,
					mission: mission.trim(),
					knowledge: knowledge.trim(),
					template: useTemplate && canTemplate,
					goals: cleanGoals
				})
			});
			if (!r.ok) {
				const d = await r.json().catch(() => ({}));
				error = d?.error || i18n.t('companies.errorGeneric');
				submitting = false;
				return;
			}
			onDone();
		} catch {
			error = i18n.t('companies.errorNetwork');
			submitting = false;
		}
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') onCancel();
	}
</script>

<svelte:window onkeydown={onKeydown} />

<div class="wiz" class:embedded>
	<!-- In embedded /welcome rendert die Seite Titel/Untertitel selbst — eigenen Header weglassen. -->
	{#if !embedded}
		<header class="whead">
			<div>
				<p class="eyebrow">{i18n.t(mode === 'setup' ? 'companies.setupEyebrow' : 'companies.wizardEyebrow')}</p>
				<h2>{i18n.t(mode === 'setup' ? 'companies.setupTitle' : 'companies.wizardTitle')}</h2>
			</div>
			<button class="x" onclick={onCancel} aria-label={i18n.t('common.cancel')}>
				<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
			</button>
		</header>
	{/if}

	<!-- Fortschritt -->
	<div class="progress" aria-label={`${step}/${TOTAL}`}>
		{#each Array(TOTAL) as _, i (i)}
			<span class="dot" class:on={i + 1 <= step} class:cur={i + 1 === step}></span>
		{/each}
	</div>

	<div class="body">
		{#if step === 1}
			<div class="field">
				<label for="wz-name">{i18n.t('companies.fieldName')}</label>
				<input
					id="wz-name"
					type="text"
					autocomplete="off"
					placeholder={i18n.t('companies.fieldNamePh')}
					bind:value={name}
					use:dictation={{ getText: () => name, append: (s) => (name = (name ? name + ' ' : '') + s), lang: lang() }}
				/>
			</div>
			<div class="field">
				<label for="wz-industry">{i18n.t('companies.fieldIndustry')}</label>
				<select id="wz-industry" bind:value={industry}>
					<option value="">{i18n.t('companies.industryOwn')}</option>
					{#each templateKeys as key (key)}
						<option value={key}>{templates[key].label}</option>
					{/each}
				</select>
				<p class="hint">{i18n.t('companies.fieldIndustryHint')}</p>
			</div>
		{:else if step === 2}
			<div class="field">
				<label for="wz-mission">{i18n.t('companies.fieldMission')}</label>
				<textarea
					id="wz-mission"
					rows="3"
					placeholder={i18n.t('companies.fieldMissionPh')}
					bind:value={mission}
					use:dictation={{ getText: () => mission, append: (s) => (mission = (mission ? mission + ' ' : '') + s), lang: lang() }}
				></textarea>
			</div>
			<div class="field">
				<label for="wz-knowledge">{i18n.t('companies.fieldKnowledge')}</label>
				<textarea
					id="wz-knowledge"
					rows="4"
					placeholder={i18n.t('companies.fieldKnowledgePh')}
					bind:value={knowledge}
					use:dictation={{ getText: () => knowledge, append: (s) => (knowledge = (knowledge ? knowledge + ' ' : '') + s), lang: lang() }}
				></textarea>
				<p class="hint">{i18n.t('companies.fieldKnowledgeHint')}</p>
			</div>
		{:else if step === 3}
			<p class="lead">{i18n.t('companies.goalsLead')}</p>
			<div class="goals">
				{#each goals as _goal, i (i)}
					<div class="goal-row">
						<input
							type="text"
							placeholder={i18n.t('companies.goalPh')}
							bind:value={goals[i]}
							use:dictation={{ getText: () => goals[i], append: (s) => (goals[i] = (goals[i] ? goals[i] + ' ' : '') + s), lang: lang() }}
						/>
						<button class="goal-del" onclick={() => removeGoal(i)} aria-label={i18n.t('common.delete')}>
							<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
						</button>
					</div>
				{/each}
			</div>
			{#if goals.length < 3}
				<button class="btn ghost add-goal" onclick={addGoal}>
					<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M12 5v14M5 12h14" /></svg>
					{i18n.t('companies.goalAdd')}
				</button>
			{/if}
		{:else if step === 4}
			{#if canTemplate && activeTpl}
				<p class="lead">{i18n.t('companies.teamLead').replace('{label}', activeTpl.label)}</p>
				<label class="tpl-toggle" class:on={useTemplate}>
					<input type="checkbox" bind:checked={useTemplate} />
					<span class="switch" aria-hidden="true"></span>
					<span class="tpl-label">{i18n.t('companies.teamUse')}</span>
				</label>
				<ul class="roles" class:dim={!useTemplate}>
					{#each activeTpl.roles as role (role.title)}
						<li>
							<strong>{role.title}</strong>
							<span>{role.description}</span>
						</li>
					{/each}
				</ul>
			{:else}
				<div class="empty">
					<p>{i18n.t('companies.teamNone')}</p>
				</div>
			{/if}
		{/if}

		{#if error}
			<p class="error" role="alert">{error}</p>
		{/if}
	</div>

	<footer class="wfoot">
		{#if step > 1}
			<button class="btn ghost" onclick={back} disabled={submitting}>{i18n.t('companies.back')}</button>
		{:else}
			<button class="btn ghost" onclick={onCancel} disabled={submitting}>{i18n.t('common.cancel')}</button>
		{/if}

		{#if step < TOTAL}
			<button class="btn primary" onclick={next} disabled={!canNext}>{i18n.t('companies.next')}</button>
		{:else}
			<button class="btn primary" onclick={finish} disabled={submitting || !name.trim()}>
				{#if mode === 'setup'}
					{submitting ? i18n.t('companies.setupCreating') : i18n.t('companies.setupCreate')}
				{:else}
					{submitting ? i18n.t('companies.creating') : i18n.t('companies.create')}
				{/if}
			</button>
		{/if}
	</footer>
</div>

<style>
	.wiz {
		width: 100%;
		max-width: 480px;
		max-height: 90vh;
		display: flex;
		flex-direction: column;
		background: var(--surface-2);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow);
		overflow: hidden;
	}
	/* Eingebettet (z. B. als /welcome-Schritt): ohne eigene Card/Modal-Optik, bündig im Panel. */
	.wiz.embedded {
		max-width: 100%;
		max-height: none;
		background: transparent;
		border: none;
		box-shadow: none;
		overflow: visible;
	}
	.wiz.embedded .progress { padding-top: 4px; }
	.wiz.embedded .body { padding-left: 0; padding-right: 0; }
	.wiz.embedded .wfoot { padding-left: 0; padding-right: 0; padding-bottom: 0; }
	.whead { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 20px 22px 0; }
	.whead h2 { font-size: 18px; font-family: var(--font-display); letter-spacing: -0.01em; }
	.eyebrow { font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--text-faint); font-family: var(--font-mono); margin-bottom: 3px; }
	.x { flex: none; width: 32px; height: 32px; display: grid; place-items: center; border-radius: 9px; background: transparent; border: none; color: var(--text-faint); cursor: pointer; transition: color 0.14s, background 0.14s; }
	.x:hover { color: var(--text); background: var(--surface-1); }

	.progress { display: flex; gap: 6px; padding: 16px 22px 4px; }
	.dot { flex: 1; height: 4px; border-radius: 999px; background: var(--border); transition: background 0.2s var(--ease); }
	.dot.on { background: var(--ember); }
	.dot.cur { background: var(--ember-bright); }

	.body { padding: 14px 22px 4px; overflow-y: auto; flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 14px; }
	.lead { font-size: 13.5px; color: var(--text-muted); line-height: 1.5; }

	.field { display: flex; flex-direction: column; gap: 6px; }
	.field label { font-size: 12.5px; color: var(--text-muted); }
	.field input, .field select, .field textarea, .goal-row input {
		width: 100%; background: var(--bg); border: 1px solid var(--border); border-radius: 9px;
		color: var(--text); font: inherit; font-size: 14px; padding: 9px 11px; transition: border-color 0.14s;
	}
	.field textarea { resize: vertical; line-height: 1.5; }
	.field input:focus, .field select:focus, .field textarea:focus, .goal-row input:focus { outline: none; border-color: var(--ember-line); }
	.hint { font-size: 12px; color: var(--text-faint); line-height: 1.45; }

	.goals { display: flex; flex-direction: column; gap: 8px; }
	.goal-row { display: flex; gap: 8px; align-items: center; }
	.goal-row input { flex: 1; min-width: 0; }
	.goal-del { flex: none; width: 36px; height: 36px; display: grid; place-items: center; border-radius: 9px; background: transparent; border: 1px solid var(--border); color: var(--text-faint); cursor: pointer; transition: color 0.14s, border-color 0.14s; }
	.goal-del:hover { color: var(--danger); border-color: var(--danger-soft); }
	.add-goal { align-self: flex-start; }

	.tpl-toggle { display: flex; align-items: center; gap: 10px; cursor: pointer; user-select: none; }
	.tpl-toggle input { position: absolute; opacity: 0; width: 0; height: 0; }
	.switch { flex: none; width: 40px; height: 23px; border-radius: 999px; background: var(--border); position: relative; transition: background 0.18s var(--ease); }
	.switch::after { content: ''; position: absolute; top: 2px; left: 2px; width: 19px; height: 19px; border-radius: 50%; background: var(--text-muted); transition: transform 0.18s var(--ease), background 0.18s; }
	.tpl-toggle.on .switch { background: var(--ember); }
	.tpl-toggle.on .switch::after { transform: translateX(17px); background: #fff; }
	.tpl-label { font-size: 14px; color: var(--text); }

	.roles { display: flex; flex-direction: column; gap: 7px; transition: opacity 0.18s; }
	.roles.dim { opacity: 0.4; }
	.roles li { display: flex; flex-direction: column; gap: 1px; padding: 9px 12px; background: var(--surface-1); border: 1px solid var(--border-soft); border-radius: 9px; }
	.roles strong { font-size: 13.5px; color: var(--text); }
	.roles span { font-size: 12px; color: var(--text-muted); }

	.empty { padding: 18px; text-align: center; color: var(--text-faint); font-size: 13px; background: var(--surface-1); border: 1px dashed var(--border); border-radius: 10px; }

	.error { font-size: 13px; color: var(--danger); background: var(--danger-soft); border-radius: 9px; padding: 9px 12px; }

	.wfoot { display: flex; justify-content: space-between; gap: 10px; padding: 14px 22px 20px; border-top: 1px solid var(--border-soft); margin-top: 6px; }

	.btn { display: inline-flex; align-items: center; gap: 7px; height: 38px; padding: 0 16px; border-radius: 10px; font: inherit; font-size: 13.5px; font-weight: 500; cursor: pointer; border: 1px solid transparent; transition: background 0.14s, border-color 0.14s, color 0.14s, opacity 0.14s; }
	.btn svg { width: 16px; height: 16px; }
	.btn.primary { background: var(--ember); color: #fff; }
	.btn.primary:hover:not(:disabled) { background: var(--ember-bright); }
	.btn.ghost { background: transparent; border-color: var(--border); color: var(--text-muted); }
	.btn.ghost:hover:not(:disabled) { color: var(--text); background: var(--surface-1); }
	.btn:disabled { opacity: 0.5; cursor: default; }

	@media (max-width: 760px) {
		.wiz { max-width: 100%; max-height: 100%; height: 100%; border-radius: 0; border: none; }
	}
</style>
