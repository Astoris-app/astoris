<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { page } from '$app/state';
	import AppHeader from '$lib/components/AppHeader.svelte';
	import { i18n } from '$lib/stores/i18n.svelte';
	import { setupText } from '$lib/i18n/ai-setup';
	import type { AgentScope, SetupDraft } from '$lib/setup-plan';
	type Access = { id: string; name: string; expiresAt: string; scopes: AgentScope[]; revokedAt?: string };
	type Context = { companyId: string; baseVersion: number; profile: { name: string; industry: string; mission: string }; connectors: { id: string; name: string }[] };
	let t = $derived(setupText[i18n.lang]);
	let context = $state<Context | null>(null);
	let plans = $state<SetupDraft[]>([]);
	let accesses = $state<Access[]>([]);
	let audit = $state<{ at: string; action: string; targetId: string }[]>([]);
	let brief = $state(''), answers = $state(''), questions = $state<string[]>([]);
	let busy = $state(false), message = $state(''), accepted = $state<string[]>([]);
	let accessName = $state(''), days = $state(7), scopes = $state<AgentScope[]>(['setup:read', 'setup:propose']);
	let accessValue = $state('');
	let modelConfigured = $state<boolean | null>(null), announcement = $state('');
	let endpoint = $derived(`${page.url.origin}/api/agent/mcp`);
	let config = $derived(`[mcp_servers.astoris]\nurl = "${endpoint}"\nbearer_token_env_var = "ASTORIS_AGENT_TOKEN"\ntool_timeout_sec = 180`);
	let scopeOptions = $derived([
		{ id: 'setup:read', label: t.scopeRead }, { id: 'setup:propose', label: t.scopePropose },
		{ id: 'runs:read', label: t.scopeRuns }, { id: 'runs:create', label: t.scopeCreate }
	]);
	async function api(path: string, body?: unknown) {
		const response = await fetch(path, body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
		const data = await response.json();
		if (!response.ok) throw new Error(data.message || data.error || `${t.error} (${response.status})`);
		return data;
	}
	async function load() {
		const [setup, access, connections] = await Promise.all([api('/api/ai-setup'), api('/api/agent-access'), api('/api/connections')]);
		context = setup.context; plans = setup.plans; audit = setup.audit; accesses = access.accesses; accepted = [];
		modelConfigured = connections.connections.some((c: { connectorId: string; status: string }) => ['local-models', 'cloud-ai'].includes(c.connectorId) && c.status === 'ok');
	}
	async function action(work: () => Promise<void>) {
		if (busy) return;
		busy = true; message = '';
		try { await work(); } catch (cause) { message = cause instanceof Error ? cause.message : t.error; }
		finally { busy = false; }
	}
	async function generate() {
		if (!modelConfigured) return;
		let focusId = '';
		announcement = '';
		await action(async () => {
			const result = await api('/api/ai-setup', { action: 'propose', brief, answers, lang: i18n.lang });
			if (result.kind === 'questions') { questions = result.questions; focusId = 'answers'; announcement = t.questionsReady; }
			else { questions = []; await load(); focusId = `plan-${result.draft.id}`; announcement = t.planReady; }
		});
		await tick();
		const target = focusId ? document.getElementById(focusId) : null;
		target?.focus({ preventScroll: true }); target?.scrollIntoView({ block: 'start' });
	}
	async function decide(id: string, approve: boolean) {
		await action(async () => {
			const result = await api('/api/ai-setup', { action: approve ? 'approve' : 'reject', id });
			await load(); message = result.warning ?? '';
			announcement = approve ? t.applied : t.rejected;
		});
		await tick();
		const target = document.getElementById(`plan-${id}`);
		target?.focus({ preventScroll: true }); target?.scrollIntoView({ block: 'start' });
	}
	async function issue() {
		await action(async () => {
			const result = await api('/api/agent-access', { action: 'create', name: accessName, days, scopes });
			accessValue = result.credential; accessName = ''; await load();
		});
	}
	async function revoke(id: string) {
		if (!confirm(t.revokeConfirm)) return;
		await action(async () => { await api('/api/agent-access', { action: 'revoke', id }); accessValue = ''; await load(); });
	}
	onMount(() => { void action(load); });
</script>

<AppHeader title={t.title} eyebrow="Astoris">
	<a class="btn" href="/connections#ai-models">{modelConfigured ? t.manageModel : t.connectModel}</a>
</AppHeader>
<div class="scroll"><div class="content">
	<p class="intro">{t.intro}</p>
	<ol class="steps" aria-label={i18n.lang === 'de' ? 'Einrichtungsschritte' : 'Setup steps'}><li>{t.stepDescribe}</li><li>{t.stepReview}</li><li>{t.stepApply}</li></ol>
	<p class="sr-only" aria-live="polite" aria-atomic="true">{announcement}</p>
	<nav><a href="/welcome?replay=1">{t.tour} →</a> <button disabled={busy} onclick={() => action(load)}>{t.reload}</button></nav>
	{#if message}<p class="notice" role="alert">{message}</p>{/if}
	{#if context}
		<section class="card" aria-labelledby="current-title">
			<h2 id="current-title">{t.current}</h2>
			{#if context.profile.name}<p><strong>{context.profile.name}</strong>{#if context.profile.industry} · {context.profile.industry}{/if}</p><p>{context.profile.mission}</p>
			{:else}<p><strong>{t.emptyCompany}</strong></p><p>{t.emptyCompanyHint}</p>{/if}
		</section>
	{/if}
	<section class="card">
		<form onsubmit={(event) => { event.preventDefault(); void generate(); }}>
			<label for="brief">{t.brief}</label><textarea id="brief" bind:value={brief} placeholder={t.placeholder} maxlength="6000" required rows="4"></textarea>
			<p class="muted">{t.privacy}</p>
			{#if questions.length}
				<h3>{t.questions}</h3><ol>{#each questions as question}<li>{question}</li>{/each}</ol>
				<label for="answers">{t.answers}</label><textarea id="answers" bind:value={answers} maxlength="6000" rows="4"></textarea>
			{/if}
			<div class="model-state" class:ready={modelConfigured === true} class:missing={modelConfigured === false} role="status"><strong>{modelConfigured === null ? t.modelChecking : modelConfigured ? t.modelReady : t.modelMissing}</strong>
				<p class="muted">{modelConfigured ? t.modelReadyHint : t.model}</p>
				{#if modelConfigured === false}<a class="btn" href="/connections#ai-models">{t.connectModel} →</a>{/if}
			</div>
			<button class="primary" disabled={busy || !brief.trim() || !modelConfigured}>{busy ? t.working : t.generate}</button>
		</form>
	</section>
	<section aria-labelledby="plans-title">
		<h2 id="plans-title">{t.plans}</h2>
		{#if !plans.length}<p class="muted">{t.empty}</p>{/if}
		{#each plans as draft (draft.id)}
			<article class="card plan" id={`plan-${draft.id}`} tabindex="-1" aria-labelledby={`plan-title-${draft.id}`}>
				<div class="row"><strong id={`plan-title-${draft.id}`}>{t[draft.status]}</strong><span class="muted">{t.expires}: {new Date(draft.expiresAt).toLocaleString(i18n.lang)}</span></div>
				<p>{draft.plan.summary}</p>
				<h3>{t.profile}</h3><dl><dt>{t.companyName}</dt><dd>{draft.plan.profile.name}</dd><dt>{i18n.lang === 'de' ? 'Branche' : 'Industry'}</dt><dd>{draft.plan.profile.industry}</dd><dt>Mission</dt><dd>{draft.plan.profile.mission}</dd></dl>
				<div class="grid"><div><h3>{t.roles}</h3><ul>{#each draft.plan.roles as role}<li><strong>{role.title}</strong> — {role.description}</li>{/each}</ul></div>
				<div><h3>{t.goals}</h3><ul>{#each draft.plan.goals as goal}<li><strong>{goal.title}</strong> — {goal.description}</li>{/each}</ul></div></div>
				<h3>{t.connections}</h3>{#if draft.plan.connectors.length}<ul>{#each draft.plan.connectors as id}<li><a href="/connections">{context?.connectors.find((c) => c.id === id)?.name ?? id}</a></li>{/each}</ul>{:else}<p class="muted">{t.noConnections}</p>{/if}
				<p class="muted">{t.limits}</p>
				{#if draft.status === 'draft'}
					<label class="check"><input type="checkbox" bind:group={accepted} value={draft.id} disabled={busy} />{t.confirm}</label>
					<div class="row"><button class="primary" disabled={busy || !accepted.includes(draft.id) || Date.parse(draft.expiresAt) <= Date.now()} onclick={() => decide(draft.id, true)}>{t.approve}</button>
					<button disabled={busy} onclick={() => decide(draft.id, false)}>{t.reject}</button></div>
				{/if}
				{#if draft.status === 'applied'}<div class="row"><a class="btn" href="/agents">{t.teamNext} →</a><a class="btn" href="/firma">{t.cockpitNext} →</a></div>{/if}
			</article>
		{/each}
	</section>
	<details class="card advanced">
		<summary>{t.advanced}</summary>
	<section aria-labelledby="agent-title">
		<h2 id="agent-title">{t.agentTitle}</h2><p>{t.agentIntro}</p>
		<form onsubmit={(event) => { event.preventDefault(); void issue(); }}>
			<div class="grid"><div><label for="access-name">{t.name}</label><input id="access-name" bind:value={accessName} maxlength="80" required /></div>
			<div><label for="days">{t.days}</label><select id="days" bind:value={days}><option value={1}>1</option><option value={7}>7</option><option value={30}>30</option></select></div></div>
			<fieldset><legend>{t.scopes}</legend>{#each scopeOptions as scope}<label class="check"><input type="checkbox" bind:group={scopes} value={scope.id} />{scope.label}</label>{/each}</fieldset>
			<button disabled={busy || !accessName.trim() || !scopes.length}>{t.create}</button>
		</form>
		{#if accessValue}<aside class="notice"><p>{t.once}</p><textarea aria-label="Agent access credential" value={accessValue} readonly spellcheck="false" autocomplete="off" rows="2"></textarea><button onclick={() => accessValue = ''}>{t.hide}</button></aside>{/if}
		<p class="muted">{t.accessWarning}</p>
		<h3>{t.endpoint}</h3><code>{endpoint}</code><h3>{t.config}</h3><pre>{config}</pre>
		{#each accesses as access (access.id)}<div class="access"><div><strong>{access.name}</strong><p class="muted">{access.scopes.join(', ')} · {new Date(access.expiresAt).toLocaleString(i18n.lang)}</p></div>
			{#if access.revokedAt}<span>{t.revoked}</span>{:else}<button disabled={busy} onclick={() => revoke(access.id)}>{t.revoke}</button>{/if}</div>{/each}
	</section>
	</details>
	<details class="card"><summary>{t.audit}</summary><ul>{#each audit as event}<li>{new Date(event.at).toLocaleString(i18n.lang)} · {event.action}</li>{/each}</ul></details>
</div></div>

<style>
	.scroll { flex: 1; min-height: 0; overflow: auto; padding: 24px 28px 64px; }
	.content { max-width: 1050px; margin-inline: auto; }
	.intro { max-width: 75ch; font-size: 1.05rem; line-height: 1.7; }
	.card { background: var(--surface-1); border: 1px solid var(--border-soft); border-radius: 14px; padding: 22px; margin-block: 20px; }
	h2 { font-size: 1.2rem; margin: 0 0 16px; } h3 { font-size: 1rem; margin: 20px 0 10px; }
	p, li { line-height: 1.65; overflow-wrap: anywhere; } p { margin-block: 10px; }
	.muted { color: var(--text-muted); font-size: .9rem; } nav, .row, .access { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; }
	nav { margin-top: 16px; } a { color: var(--link); }
	.steps { display: flex; flex-wrap: wrap; gap: 10px 20px; padding: 0; list-style: none; color: var(--text-muted); font-size: .9rem; }
	.model-state { border-left: 3px solid var(--border); padding-left: 14px; margin: 20px 0; }
	.model-state.ready { border-color: var(--sage); } .model-state.missing { border-color: var(--ember); }
	summary { cursor: pointer; font-weight: 600; } .advanced[open] > summary { margin-bottom: 22px; }
	.plan, #answers { scroll-margin-block: 20px; }
	.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
	label { display: block; margin: 12px 0 8px; } .check { display: flex; align-items: flex-start; gap: 10px; }
	textarea, input:not([type=checkbox]), select { width: 100%; max-width: 100%; padding: 12px; border: 1px solid var(--border-soft); border-radius: 8px; background: var(--bg); color: var(--text); font: inherit; box-sizing: border-box; }
	textarea { resize: vertical; } input[type=checkbox] { margin-top: 4px; flex: none; }
	button, .btn { border: 1px solid var(--border-soft); border-radius: 8px; padding: 10px 14px; background: var(--surface-2); color: var(--text); cursor: pointer; font: inherit; }
	button:disabled { opacity: .5; cursor: not-allowed; } .primary { background: var(--ember-bright); color: var(--on-accent); border-color: var(--ember-bright); }
	.grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px; }
	fieldset { border: 1px solid var(--border-soft); margin: 18px 0; border-radius: 8px; } .notice { padding: 16px; border: 1px solid var(--ember-bright); border-radius: 10px; margin-block: 18px; }
	dl { display: grid; grid-template-columns: minmax(80px, auto) 1fr; gap: 8px 18px; } dt { color: var(--text-muted); } dd { margin: 0; overflow-wrap: anywhere; }
	code, pre { white-space: pre-wrap; overflow-wrap: anywhere; font-size: .85rem; } .access { padding-top: 16px; border-top: 1px solid var(--border-soft); margin-top: 16px; }
	@media(max-width: 700px) { .scroll { padding: 18px 16px 60px; } .card { padding: 16px; } .grid { grid-template-columns: 1fr; gap: 8px; } }
</style>
