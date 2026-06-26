<script lang="ts">
	import { onMount } from 'svelte';
	import AppHeader from '$lib/components/AppHeader.svelte';
	import { renderMarkdown } from '$lib/markdown';
	import { i18n } from '$lib/stores/i18n.svelte';

	// ---------- Types ----------
	type Persona = {
		id: string;
		name: string;
		tagline: string;
		systemPrompt: string;
		emoji: string;
		builtin: boolean;
		createdAt?: string;
	};
	type Role = { id: string; title: string; description: string };
	type HistoryEntry = { task: string; result: string; at: string };
	type SubAgent = {
		id: string;
		name: string;
		role: string;
		personaId: string;
		status: string;
		model?: { source: string; model: string } | null;
		tools?: string[];
		history?: HistoryEntry[];
	};
	type Company = {
		name: string;
		industry: string;
		mission: string;
		roles: Role[];
		agents: SubAgent[];
		knowledge?: string;
	};
	type Template = { label: string; roles: { title: string; description: string }[] };
	type Tool = { name: string; label: string };
	type BreakdownItem = { agent: string; role: string; auftrag: string; ergebnis: string };

	// ---------- State ----------
	let tab = $state<'personas' | 'company'>('personas');

	let personas = $state<Persona[]>([]);
	let company = $state<Company>({ name: '', industry: '', mission: '', roles: [], agents: [], knowledge: '' });
	let templates = $state<Record<string, Template>>({});
	let modelOpts = $state<{ id: string; label: string; source: string; model: string }[]>([]);
	let loading = $state(true);

	// persona editor dialog
	let editor = $state<{
		open: boolean;
		id: string | null;
		emoji: string;
		name: string;
		tagline: string;
		systemPrompt: string;
		busy: boolean;
		error: string;
	}>({ open: false, id: null, emoji: '', name: '', tagline: '', systemPrompt: '', busy: false, error: '' });

	// company head form
	let cName = $state('');
	let cIndustry = $state('');
	let cMission = $state('');
	let savingCompany = $state(false);

	// knowledge base
	let cKnowledge = $state('');
	let savingKnowledge = $state(false);

	// available tools (built-in + add-ons)
	let toolsBuiltin = $state<Tool[]>([]);
	let toolsAddons = $state<Tool[]>([]);
	let openTools = $state<string | null>(null); // agentId whose tools panel is open

	// company orchestration
	let coTask = $state('');
	let coBusy = $state(false);
	let coResult = $state('');
	let coBreakdown = $state<BreakdownItem[]>([]);

	// role form
	let roleTitle = $state('');
	let roleDesc = $state('');

	// agent form
	let agentName = $state('');
	let agentRole = $state('');
	let agentPersona = $state('');

	// ---------- Derived ----------
	let templateKeys = $derived(Object.keys(templates));
	let activeTemplate = $derived(templates[cIndustry] ?? null);

	function personaById(id: string): Persona | undefined {
		return personas.find((p) => p.id === id);
	}

	// ---------- Loaders ----------
	async function loadPersonas() {
		try {
			const res = await fetch('/api/personas');
			const data = await res.json();
			personas = Array.isArray(data?.personas) ? data.personas : [];
		} catch {
			personas = [];
		}
	}

	async function loadCompany() {
		try {
			const res = await fetch('/api/company');
			const data = await res.json();
			const c = data?.company ?? {};
			company = {
				name: c.name ?? '',
				industry: c.industry ?? '',
				mission: c.mission ?? '',
				roles: Array.isArray(c.roles) ? c.roles : [],
				agents: Array.isArray(c.agents) ? c.agents : [],
				knowledge: c.knowledge ?? ''
			};
			templates = data?.templates && typeof data.templates === 'object' ? data.templates : {};
			// sync head form
			cName = company.name;
			cIndustry = company.industry;
			cMission = company.mission;
			cKnowledge = company.knowledge ?? '';
		} catch {
			company = { name: '', industry: '', mission: '', roles: [], agents: [], knowledge: '' };
			templates = {};
		}
	}

	async function loadTools() {
		try {
			const r = await (await fetch('/api/tools')).json();
			toolsBuiltin = Array.isArray(r?.builtin) ? r.builtin : [];
			toolsAddons = Array.isArray(r?.addons) ? r.addons : [];
		} catch {
			toolsBuiltin = [];
			toolsAddons = [];
		}
	}

	async function loadModels() {
		try {
			const r = await (await fetch('/api/models')).json();
			modelOpts = r.models ?? [];
		} catch {
			/* offline ok */
		}
	}

	onMount(async () => {
		await Promise.all([loadPersonas(), loadCompany(), loadModels(), loadTools()]);
		loading = false;
	});

	// ---------- Persona actions ----------
	function openCreate() {
		editor = { open: true, id: null, emoji: '', name: '', tagline: '', systemPrompt: '', busy: false, error: '' };
	}
	function openEdit(p: Persona) {
		editor = {
			open: true,
			id: p.id,
			emoji: p.emoji ?? '',
			name: p.name ?? '',
			tagline: p.tagline ?? '',
			systemPrompt: p.systemPrompt ?? '',
			busy: false,
			error: ''
		};
	}
	function closeEditor() {
		editor = { ...editor, open: false };
	}

	async function savePersona() {
		if (editor.busy) return;
		if (!editor.name.trim()) {
			editor.error = i18n.t('agents.nameRequired');
			return;
		}
		editor.busy = true;
		editor.error = '';
		const body = {
			name: editor.name.trim(),
			tagline: editor.tagline.trim(),
			systemPrompt: editor.systemPrompt,
			emoji: editor.emoji.trim() || '🙂'
		};
		try {
			const url = editor.id ? `/api/personas?id=${encodeURIComponent(editor.id)}` : '/api/personas';
			const res = await fetch(url, {
				method: editor.id ? 'PUT' : 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(body)
			});
			if (!res.ok) {
				editor.error = i18n.t('agents.saveFailed');
				editor.busy = false;
				return;
			}
			await loadPersonas();
			closeEditor();
		} catch {
			editor.error = i18n.t('agents.networkError');
		} finally {
			editor.busy = false;
		}
	}

	async function deletePersona(p: Persona) {
		if (p.builtin) return;
		if (!confirm(i18n.t('agents.deletePersonaConfirm').replace('{name}', p.name))) return;
		try {
			await fetch(`/api/personas?id=${encodeURIComponent(p.id)}`, { method: 'DELETE' });
			await loadPersonas();
		} catch {
			/* offline ok */
		}
	}

	// ---------- Company actions ----------
	function applyCompany(c: any) {
		company = {
			name: c.name ?? '',
			industry: c.industry ?? '',
			mission: c.mission ?? '',
			roles: Array.isArray(c.roles) ? c.roles : [],
			agents: Array.isArray(c.agents) ? c.agents : [],
			knowledge: c.knowledge ?? ''
		};
	}

	async function postCompany(payload: Record<string, unknown>): Promise<boolean> {
		try {
			const res = await fetch('/api/company', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(payload)
			});
			if (!res.ok) return false;
			const data = await res.json();
			if (data?.company) {
				applyCompany(data.company);
			}
			return true;
		} catch {
			return false;
		}
	}

	async function saveCompany() {
		if (savingCompany) return;
		savingCompany = true;
		await postCompany({ action: 'save', name: cName.trim(), industry: cIndustry, mission: cMission });
		savingCompany = false;
	}

	async function applyTemplate() {
		if (!activeTemplate) return;
		await postCompany({ action: 'apply-template', industry: cIndustry });
	}

	async function addRole() {
		if (!roleTitle.trim()) return;
		const ok = await postCompany({ action: 'add-role', title: roleTitle.trim(), description: roleDesc.trim() });
		if (ok) {
			roleTitle = '';
			roleDesc = '';
		}
	}
	async function removeRole(id: string) {
		await postCompany({ action: 'remove-role', id });
	}

	async function addAgent() {
		if (!agentName.trim()) return;
		const ok = await postCompany({
			action: 'add-agent',
			name: agentName.trim(),
			role: agentRole.trim(),
			personaId: agentPersona
		});
		if (ok) {
			agentName = '';
			agentRole = '';
			agentPersona = '';
		}
	}
	async function removeAgent(id: string) {
		await postCompany({ action: 'remove-agent', id });
	}
	async function setAgentModel(agentId: string, val: string) {
		const model = val
			? { source: val.split(':')[0], model: val.split(':').slice(1).join(':') }
			: null;
		await postCompany({ action: 'set-agent-model', agentId, model });
	}

	// ---------- Knowledge base ----------
	async function saveKnowledge() {
		if (savingKnowledge) return;
		savingKnowledge = true;
		await postCompany({ action: 'set-knowledge', knowledge: cKnowledge });
		savingKnowledge = false;
	}

	// ---------- Per-agent tools ----------
	function toggleToolsPanel(id: string) {
		openTools = openTools === id ? null : id;
	}
	async function toggleAgentTool(a: SubAgent, toolName: string, checked: boolean) {
		const current = Array.isArray(a.tools) ? [...a.tools] : [];
		const next = checked ? [...new Set([...current, toolName])] : current.filter((t) => t !== toolName);
		// optimistic
		a.tools = next;
		await postCompany({ action: 'set-agent-tools', agentId: a.id, tools: next });
	}

	// ---------- Task overlay (single agent) ----------
	let taskAgent = $state<SubAgent | null>(null);
	let taskInput = $state('');
	let taskResult = $state('');
	let taskBusy = $state(false);
	function openTask(a: SubAgent) { taskAgent = a; taskInput = ''; taskResult = ''; }
	function rebindTaskAgent() {
		if (!taskAgent) return;
		const fresh = company.agents.find((x) => x.id === taskAgent!.id);
		if (fresh) taskAgent = fresh;
	}
	async function runTask() {
		if (!taskAgent || !taskInput.trim() || taskBusy) return;
		taskBusy = true; taskResult = '';
		try {
			const r = await fetch('/api/company', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'run-agent', agentId: taskAgent.id, task: taskInput }) });
			const d = await r.json();
			taskResult = d.result ?? d.error ?? i18n.t('agents.noAnswer');
			if (d.company) { applyCompany(d.company); rebindTaskAgent(); }
		} catch { taskResult = i18n.t('agents.runError'); }
		finally { taskBusy = false; }
	}
	async function clearAgentHistory() {
		if (!taskAgent) return;
		const ok = await postCompany({ action: 'clear-history', agentId: taskAgent.id });
		if (ok) rebindTaskAgent();
	}

	// ---------- Company orchestration ----------
	async function runCompany() {
		if (!coTask.trim() || coBusy) return;
		coBusy = true; coResult = ''; coBreakdown = [];
		try {
			const r = await fetch('/api/company', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'run-company', task: coTask }) });
			const d = await r.json();
			coResult = d.result ?? d.error ?? i18n.t('agents.noAnswer');
			coBreakdown = Array.isArray(d.breakdown) ? d.breakdown : [];
			if (d.company) applyCompany(d.company);
		} catch { coResult = i18n.t('agents.runError'); }
		finally { coBusy = false; }
	}

	function fmtTime(at?: string): string {
		if (!at) return '';
		const d = new Date(at);
		if (isNaN(d.getTime())) return at;
		return d.toLocaleString(i18n.lang === 'en' ? 'en-GB' : 'de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
	}
</script>

<AppHeader title={i18n.t('agents.title')} eyebrow={i18n.t('agents.eyebrow')} />

<div class="scroll">
	<!-- Tab switcher -->
	<div class="tabs" role="tablist">
		<button class="tab" class:on={tab === 'personas'} role="tab" aria-selected={tab === 'personas'} onclick={() => (tab = 'personas')}>
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
				<circle cx="12" cy="8" r="3.5" />
				<path d="M5 20c0-3.3 3.1-6 7-6s7 2.7 7 6" />
			</svg>
			{i18n.t('agents.tabPersonas')}
		</button>
		<button class="tab" class:on={tab === 'company'} role="tab" aria-selected={tab === 'company'} onclick={() => (tab = 'company')}>
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
				<path d="M4 21V6a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v15" />
				<path d="M14 9h4a2 2 0 0 1 2 2v10" />
				<path d="M3 21h18" />
				<path d="M7.5 8h.01M7.5 12h.01M10.5 8h.01M10.5 12h.01M7.5 16h3" />
			</svg>
			{i18n.t('agents.tabCompany')}
		</button>
	</div>

	{#if loading}
		<p class="muted">{i18n.t('agents.loading')}</p>
	{:else if tab === 'personas'}
		<!-- =================== PERSONAS =================== -->
		<div class="section-head">
			<p class="lead">{i18n.t('agents.personasLead')}</p>
			<button class="btn primary" onclick={openCreate}>
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
					<path d="M12 5v14M5 12h14" />
				</svg>
				{i18n.t('agents.newPersona')}
			</button>
		</div>

		{#if personas.length === 0}
			<div class="empty">
				<span class="big">🪄</span>
				<h3>{i18n.t('agents.noPersonas')}</h3>
				<p>{i18n.t('agents.noPersonasHint')}</p>
				<button class="btn primary" onclick={openCreate}>{i18n.t('agents.createFirstPersona')}</button>
			</div>
		{:else}
			<div class="grid">
				{#each personas as p (p.id)}
					<article class="card persona">
						<div class="top">
							<span class="emoji">{p.emoji || '🙂'}</span>
							{#if p.builtin}<span class="badge">{i18n.t('agents.templateBadge')}</span>{/if}
						</div>
						<h3>{p.name}</h3>
						<p class="tag">{p.tagline || '—'}</p>
						{#if p.systemPrompt}<p class="prompt">{p.systemPrompt}</p>{/if}
						<div class="actions">
							{#if p.builtin}
								<button class="btn ghost" onclick={() => openEdit(p)}>{i18n.t('agents.view')}</button>
							{:else}
								<button class="btn ghost" onclick={() => openEdit(p)}>{i18n.t('agents.edit')}</button>
								<button class="btn danger-ghost" onclick={() => deletePersona(p)}>{i18n.t('agents.delete')}</button>
							{/if}
						</div>
					</article>
				{/each}
			</div>
		{/if}
	{:else}
		<!-- =================== COMPANY =================== -->
		<section class="block">
			<h2 class="cat">{i18n.t('agents.company')}</h2>
			<div class="company-head">
				<div class="field">
					<label for="c-name">{i18n.t('agents.name')}</label>
					<input id="c-name" type="text" placeholder={i18n.t('agents.companyNamePlaceholder')} bind:value={cName} autocomplete="off" />
				</div>
				<div class="field">
					<label for="c-industry">{i18n.t('agents.industry')}</label>
					<select id="c-industry" bind:value={cIndustry}>
						<option value="">{i18n.t('agents.industryOwn')}</option>
						{#each templateKeys as key (key)}
							<option value={key}>{templates[key].label}</option>
						{/each}
					</select>
				</div>
				<div class="field full">
					<label for="c-mission">{i18n.t('agents.mission')}</label>
					<textarea id="c-mission" rows="3" placeholder={i18n.t('agents.missionPlaceholder')} bind:value={cMission}></textarea>
				</div>
				<div class="field full knowledge-field">
					<label for="c-knowledge">{i18n.t('agents.knowledge')}</label>
					<textarea id="c-knowledge" rows="4" placeholder={i18n.t('agents.knowledgePlaceholder')} bind:value={cKnowledge}></textarea>
					<div class="kn-row">
						<p class="hint">{i18n.t('agents.knowledgeHint')}</p>
						<button class="btn ghost" onclick={saveKnowledge} disabled={savingKnowledge}>
							{savingKnowledge ? i18n.t('agents.saving') : i18n.t('agents.knowledgeSave')}
						</button>
					</div>
				</div>
				<div class="head-actions">
					<button class="btn primary" onclick={saveCompany} disabled={savingCompany}>
						{savingCompany ? i18n.t('agents.saving') : i18n.t('agents.save')}
					</button>
					{#if activeTemplate}
						<button class="btn ghost" onclick={applyTemplate}>
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
								<path d="M12 3v6m0 0 3-3m-3 3L9 6" />
								<path d="M4 13v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" />
							</svg>
							{i18n.t('agents.applyTemplate')}
						</button>
					{/if}
				</div>
				{#if activeTemplate}
					<p class="hint mono">{i18n.t('agents.templateSuggests').replace('{label}', activeTemplate.label).replace('{count}', String(activeTemplate.roles.length))}</p>
				{/if}
			</div>
		</section>

		<!-- Roles -->
		<section class="block">
			<h2 class="cat">{i18n.t('agents.roles')}</h2>
			{#if company.roles.length === 0}
				<div class="empty small">
					<span class="big">🧩</span>
					<p>{i18n.t('agents.noRoles')}</p>
				</div>
			{:else}
				<div class="list">
					{#each company.roles as r (r.id)}
						<div class="row">
							<div class="row-main">
								<strong>{r.title}</strong>
								{#if r.description}<span class="row-sub">{r.description}</span>{/if}
							</div>
							<button class="x" aria-label={i18n.t('agents.removeRole')} onclick={() => removeRole(r.id)}>×</button>
						</div>
					{/each}
				</div>
			{/if}
			<div class="add-form">
				<input type="text" placeholder={i18n.t('agents.roleTitlePlaceholder')} bind:value={roleTitle} autocomplete="off" />
				<input type="text" placeholder={i18n.t('agents.roleDescPlaceholder')} bind:value={roleDesc} autocomplete="off" />
				<button class="btn ghost" onclick={addRole} disabled={!roleTitle.trim()}>{i18n.t('agents.add')}</button>
			</div>
		</section>

		<!-- Sub-agents -->
		<section class="block">
			<h2 class="cat">{i18n.t('agents.subagents')}</h2>

			<!-- Commission the whole company -->
			{#if company.agents.length > 0}
				<div class="commission">
					<div class="commission-head">
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
							<path d="M12 2v4M12 18v4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M2 12h4M18 12h4M4.9 19.1l2.8-2.8M16.3 7.7l2.8-2.8" />
							<circle cx="12" cy="12" r="3" />
						</svg>
						<div>
							<strong>{i18n.t('agents.commissionCompany')}</strong>
							<span class="commission-hint">{i18n.t('agents.commissionHint')}</span>
						</div>
					</div>
					<textarea rows="3" placeholder={i18n.t('agents.commissionPlaceholder')} bind:value={coTask}></textarea>
					<div class="commission-actions">
						{#if coBusy}<span class="working-note">{coResult ? i18n.t('agents.agentsWorking') : i18n.t('agents.coordinating')}</span>{/if}
						<button class="btn primary" onclick={runCompany} disabled={coBusy || !coTask.trim()}>
							{coBusy ? i18n.t('agents.working') : i18n.t('agents.commissionRun')}
						</button>
					</div>
					{#if coResult}
						<div class="overall">
							<span class="overall-label">{i18n.t('agents.overallResult')}</span>
							<div class="md result-md">{@html renderMarkdown(coResult)}</div>
						</div>
						{#if coBreakdown.length}
							<details class="breakdown">
								<summary>{i18n.t('agents.breakdown')} · {coBreakdown.length}</summary>
								<div class="breakdown-body">
									{#each coBreakdown as b, i (i)}
										<div class="bd-item">
											<div class="bd-head">
												<strong>{b.agent}</strong>
												{#if b.role}<span class="bd-role">{b.role}</span>{/if}
											</div>
											{#if b.auftrag}<p class="bd-task">{b.auftrag}</p>{/if}
											<div class="md result-md small">{@html renderMarkdown(b.ergebnis ?? '')}</div>
										</div>
									{/each}
								</div>
							</details>
						{/if}
					{/if}
				</div>
			{/if}

			{#if company.agents.length === 0}
				<div class="empty small">
					<span class="big">🤝</span>
					<p>{i18n.t('agents.noSubagents')}</p>
				</div>
			{:else}
				<div class="list">
					{#each company.agents as a (a.id)}
						{@const persona = personaById(a.personaId)}
						{@const sel = Array.isArray(a.tools) ? a.tools : []}
						<div class="agent-wrap">
							<div class="row agent">
								<span class="status-dot" class:online={a.status === 'online' || a.status === 'active'}></span>
								<div class="row-main">
									<strong>{a.name}</strong>
									{#if a.role}<span class="row-sub">{a.role}</span>{/if}
								</div>
								<div class="persona-chip">
									{#if persona}
										<span class="chip-emoji">{persona.emoji || '🙂'}</span>
										<span>{persona.name}</span>
									{:else}
										<span class="muted">{i18n.t('agents.noPersona')}</span>
									{/if}
								</div>
								{#if modelOpts.length}
									<select
										class="agent-model"
										value={a.model ? a.model.source + ':' + a.model.model : ''}
										onchange={(e) => setAgentModel(a.id, e.currentTarget.value)}
									>
										<option value="">{i18n.t('agents.modelDefault')}</option>
										{#each modelOpts as m (m.id)}<option value={m.source + ':' + m.model}>{m.label}</option>{/each}
									</select>
								{/if}
								{#if toolsBuiltin.length || toolsAddons.length}
									<button class="task-btn tools-toggle" class:on={openTools === a.id} title={i18n.t('agents.tools')} onclick={() => toggleToolsPanel(a.id)}>
										{i18n.t('agents.tools')}{#if sel.length} · {sel.length}{/if}
									</button>
								{/if}
								<button class="task-btn" title={i18n.t('agents.taskTitle')} onclick={() => openTask(a)}>{i18n.t('agents.task')}</button>
								<button class="x" aria-label={i18n.t('agents.removeAgent')} onclick={() => removeAgent(a.id)}>×</button>
							</div>
							{#if openTools === a.id && (toolsBuiltin.length || toolsAddons.length)}
								<div class="tools-panel">
									<p class="tools-hint">{i18n.t('agents.toolsHint')} <em>{i18n.t('agents.toolsAll')}</em></p>
									{#if toolsBuiltin.length}
										<div class="tools-group">
											<span class="tools-group-title">{i18n.t('agents.toolsBuiltin')}</span>
											<div class="tools-checks">
												{#each toolsBuiltin as t (t.name)}
													<label class="tool-check">
														<input type="checkbox" checked={sel.includes(t.name)} onchange={(e) => toggleAgentTool(a, t.name, e.currentTarget.checked)} />
														<span>{t.label}</span>
													</label>
												{/each}
											</div>
										</div>
									{/if}
									{#if toolsAddons.length}
										<div class="tools-group">
											<span class="tools-group-title">{i18n.t('agents.toolsAddons')}</span>
											<div class="tools-checks">
												{#each toolsAddons as t (t.name)}
													<label class="tool-check">
														<input type="checkbox" checked={sel.includes(t.name)} onchange={(e) => toggleAgentTool(a, t.name, e.currentTarget.checked)} />
														<span>{t.label}</span>
													</label>
												{/each}
											</div>
										</div>
									{/if}
								</div>
							{/if}
						</div>
					{/each}
				</div>
			{/if}
			<div class="add-form agent-form">
				<input type="text" placeholder={i18n.t('agents.namePlaceholder')} bind:value={agentName} autocomplete="off" />
				<input type="text" placeholder={i18n.t('agents.rolePlaceholder')} bind:value={agentRole} list="role-suggestions" autocomplete="off" />
				<datalist id="role-suggestions">
					{#each company.roles as r (r.id)}<option value={r.title}></option>{/each}
				</datalist>
				<select bind:value={agentPersona}>
					<option value="">{i18n.t('agents.choosePersona')}</option>
					{#each personas as p (p.id)}
						<option value={p.id}>{(p.emoji || '🙂') + ' ' + p.name}</option>
					{/each}
				</select>
				<button class="btn ghost" onclick={addAgent} disabled={!agentName.trim()}>{i18n.t('agents.createAgent')}</button>
			</div>
		</section>
	{/if}
</div>

<!-- =================== PERSONA EDITOR DIALOG =================== -->
{#if editor.open}
	{@const readOnly = editor.id !== null && personaById(editor.id)?.builtin === true}
	<div class="overlay" role="button" tabindex="0" onclick={closeEditor} onkeydown={(e) => e.key === 'Escape' && closeEditor()}>
		<div
			class="dialog"
			role="dialog"
			aria-modal="true"
			aria-label={i18n.t('agents.dialogLabel')}
			tabindex="-1"
			onclick={(e) => e.stopPropagation()}
			onkeydown={() => {}}
		>
			<div class="dhead">
				<span class="emoji big">{editor.emoji || '🙂'}</span>
				<div>
					<h3>{editor.id ? (readOnly ? i18n.t('agents.editorView') : i18n.t('agents.editorEdit')) : i18n.t('agents.editorNew')}</h3>
					<span class="eyebrow">{readOnly ? i18n.t('agents.editorReadonly') : i18n.t('agents.editorSubtitle')}</span>
				</div>
			</div>

			<div class="fields">
				<div class="two">
					<label>
						<span>{i18n.t('agents.emoji')}</span>
						<input type="text" maxlength="4" placeholder="🙂" bind:value={editor.emoji} disabled={readOnly} autocomplete="off" />
					</label>
					<label class="grow">
						<span>{i18n.t('agents.name')}</span>
						<input type="text" placeholder={i18n.t('agents.personaNamePlaceholder')} bind:value={editor.name} disabled={readOnly} autocomplete="off" />
					</label>
				</div>
				<label>
					<span>{i18n.t('agents.tagline')}</span>
					<input type="text" placeholder={i18n.t('agents.taglinePlaceholder')} bind:value={editor.tagline} disabled={readOnly} autocomplete="off" />
				</label>
				<label>
					<span>{i18n.t('agents.systemPrompt')}</span>
					<textarea rows="6" placeholder={i18n.t('agents.systemPromptPlaceholder')} bind:value={editor.systemPrompt} disabled={readOnly}></textarea>
				</label>
			</div>

			{#if editor.error}
				<div class="result bad"><span>✕</span>{editor.error}</div>
			{/if}

			<div class="dactions">
				<button class="btn ghost" onclick={closeEditor}>{readOnly ? i18n.t('agents.close') : i18n.t('agents.cancel')}</button>
				{#if !readOnly}
					<button class="btn primary" onclick={savePersona} disabled={editor.busy}>
						{editor.busy ? i18n.t('agents.saving') : editor.id ? i18n.t('agents.saveChanges') : i18n.t('agents.create')}
					</button>
				{/if}
			</div>
		</div>
	</div>
{/if}

{#if taskAgent}
	<div class="task-overlay" role="button" tabindex="0" onclick={() => (taskAgent = null)} onkeydown={(e) => e.key === 'Escape' && (taskAgent = null)}>
		<div class="task-dialog" role="dialog" aria-modal="true" tabindex="-1" onclick={(e) => e.stopPropagation()} onkeydown={() => {}}>
			<h3>{i18n.t('agents.taskFor').replace('{name}', taskAgent.name)}</h3>
			<p class="task-role">{taskAgent.role}</p>
			<textarea bind:value={taskInput} rows="3" placeholder={i18n.t('agents.taskPlaceholder').replace('{name}', taskAgent.name)}></textarea>
			<div class="task-actions">
				<button class="tbtn ghost" onclick={() => (taskAgent = null)}>{i18n.t('agents.close')}</button>
				<button class="tbtn primary" onclick={runTask} disabled={taskBusy || !taskInput.trim()}>{taskBusy ? i18n.t('agents.running') : i18n.t('agents.run')}</button>
			</div>
			{#if taskBusy}<div class="task-working"><span class="dot"></span>{i18n.t('agents.working')}</div>{/if}
			{#if taskResult}<div class="task-result md result-md">{@html renderMarkdown(taskResult)}</div>{/if}

			<div class="hist-head">
				<span class="hist-title">{i18n.t('agents.history')}</span>
				{#if taskAgent.history?.length}
					<button class="hist-clear" onclick={clearAgentHistory}>{i18n.t('agents.clearHistory')}</button>
				{/if}
			</div>
			{#if taskAgent.history?.length}
				<div class="hist-list">
					{#each [...taskAgent.history].reverse() as h, i (i)}
						<div class="hist-item">
							<div class="hist-meta">
								<span class="hist-task">{h.task}</span>
								<span class="hist-time">{fmtTime(h.at)}</span>
							</div>
							<div class="md result-md small">{@html renderMarkdown(h.result ?? '')}</div>
						</div>
					{/each}
				</div>
			{:else}
				<p class="hist-empty">{i18n.t('agents.historyEmpty')}</p>
			{/if}
		</div>
	</div>
{/if}

<style>
	.task-btn { font-size: 12px; color: var(--text-muted); background: var(--surface-2); border: 1px solid var(--border-soft); border-radius: 7px; padding: 5px 10px; transition: all 0.14s; }
	.task-btn:hover { color: var(--ember-bright); border-color: var(--ember-line); }
	.task-overlay { position: fixed; inset: 0; background: rgba(8,6,4,0.66); backdrop-filter: blur(3px); display: grid; place-items: center; padding: 20px; z-index: 100; }
	.task-dialog { width: 100%; max-width: 480px; max-height: 88vh; overflow-y: auto; background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 22px; box-shadow: var(--shadow); }
	.task-dialog h3 { font-size: 16px; }
	.task-role { color: var(--text-faint); font-size: 12.5px; margin: 2px 0 14px; }
	.task-dialog textarea { width: 100%; background: var(--bg); border: 1px solid var(--border); border-radius: 10px; color: var(--text); padding: 11px 13px; font-family: var(--font-body); font-size: 14px; resize: vertical; }
	.task-dialog textarea:focus { outline: none; border-color: var(--ember-line); }
	.task-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 14px; }
	.tbtn { border-radius: 9px; padding: 9px 15px; font-size: 13px; font-weight: 500; border: 1px solid transparent; transition: all 0.16s; }
	.tbtn.primary { background: var(--ember); color: #1a1206; }
	.tbtn.primary:disabled { opacity: 0.5; }
	.tbtn.ghost { background: transparent; border: 1px solid var(--border); color: var(--text-muted); }
	.task-result { margin-top: 16px; padding: 13px; background: var(--bg-veil); border: 1px solid var(--border-soft); border-radius: 10px; font-size: 13.5px; line-height: 1.6; max-height: 300px; overflow-y: auto; }
	.scroll { flex: 1; overflow-y: auto; padding: 24px 28px 48px; }

	/* Tabs */
	.tabs { display: inline-flex; gap: 4px; padding: 4px; background: var(--surface-1); border: 1px solid var(--border-soft); border-radius: 999px; margin-bottom: 24px; }
	.tab { display: flex; align-items: center; gap: 8px; padding: 8px 16px; border-radius: 999px; font-size: 13.5px; font-weight: 500; color: var(--text-muted); background: transparent; border: none; transition: all 0.16s; }
	.tab svg { width: 16px; height: 16px; }
	.tab:hover { color: var(--text); }
	.tab.on { background: var(--surface-3); color: var(--text); }

	.muted { color: var(--text-faint); }

	.section-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; margin-bottom: 22px; }
	.lead { color: var(--text-muted); max-width: 560px; margin: 0; }
	.cat { font-size: 13px; font-family: var(--font-mono); text-transform: uppercase; letter-spacing: 0.12em; color: var(--text-faint); margin: 0 0 14px; }

	/* Buttons */
	.btn { display: inline-flex; align-items: center; gap: 7px; border-radius: 9px; padding: 8px 14px; font-size: 13px; font-weight: 500; border: 1px solid transparent; transition: all 0.16s; white-space: nowrap; }
	.btn svg { width: 15px; height: 15px; }
	.btn:disabled { opacity: 0.45; cursor: not-allowed; }
	.btn.primary { background: var(--ember); color: #1a1206; }
	.btn.primary:not(:disabled):hover { background: var(--ember-bright); }
	.btn.ghost { background: transparent; border-color: var(--border); color: var(--text-muted); }
	.btn.ghost:not(:disabled):hover { color: var(--text); border-color: var(--text-faint); }
	.btn.danger-ghost { background: transparent; border-color: var(--danger-soft); color: var(--danger); }
	.btn.danger-ghost:hover { background: var(--danger-soft); }

	/* Persona grid */
	.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 12px; }
	.card { background: var(--surface-1); border: 1px solid var(--border-soft); border-radius: var(--radius); padding: 16px; display: flex; flex-direction: column; gap: 8px; transition: border-color 0.18s, transform 0.18s var(--ease); }
	.card:hover { transform: translateY(-2px); border-color: var(--border); }
	.persona .top { display: flex; align-items: flex-start; justify-content: space-between; }
	.emoji { font-size: 30px; line-height: 1; }
	.emoji.big { font-size: 30px; }
	.badge { font-size: 10px; text-transform: uppercase; letter-spacing: 0.09em; color: var(--ember-bright); background: var(--ember-soft); border: 1px solid var(--ember-line); padding: 2px 8px; border-radius: 999px; }
	.card h3 { font-size: 15.5px; }
	.tag { margin: 0; font-size: 13px; color: var(--text-muted); }
	.prompt { margin: 2px 0 0; font-size: 12px; color: var(--text-faint); display: -webkit-box; -webkit-line-clamp: 3; line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
	.actions { display: flex; gap: 8px; margin-top: auto; padding-top: 6px; }

	/* Empty states */
	.empty { text-align: center; padding: 48px 20px; background: var(--surface-1); border: 1px dashed var(--border); border-radius: var(--radius-lg); display: flex; flex-direction: column; align-items: center; gap: 8px; }
	.empty.small { padding: 28px 20px; }
	.empty .big { font-size: 36px; }
	.empty h3 { font-size: 16px; }
	.empty p { margin: 0; color: var(--text-muted); font-size: 13.5px; max-width: 420px; }
	.empty .btn { margin-top: 10px; }

	/* Company */
	.block { margin-bottom: 30px; }
	.company-head { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; background: var(--surface-1); border: 1px solid var(--border-soft); border-radius: var(--radius); padding: 18px; }
	.field { display: flex; flex-direction: column; gap: 6px; }
	.field.full { grid-column: 1 / -1; }
	.field label { font-size: 12.5px; color: var(--text-muted); }
	.head-actions { grid-column: 1 / -1; display: flex; gap: 10px; flex-wrap: wrap; }
	.hint { grid-column: 1 / -1; margin: 0; font-size: 11px; color: var(--text-faint); }

	/* Lists */
	.list { display: flex; flex-direction: column; gap: 8px; margin-bottom: 14px; }
	.row { display: flex; align-items: center; gap: 12px; background: var(--surface-1); border: 1px solid var(--border-soft); border-radius: var(--radius-sm); padding: 12px 14px; }
	.row-main { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
	.row-main strong { font-size: 14px; font-weight: 600; }
	.row-sub { font-size: 12.5px; color: var(--text-muted); }
	.row.agent .status-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--text-faint); flex: none; }
	.row.agent .status-dot.online { background: var(--sage); }
	.persona-chip { display: flex; align-items: center; gap: 6px; font-size: 12.5px; color: var(--text-muted); background: var(--surface-2); border: 1px solid var(--border-soft); border-radius: 999px; padding: 4px 10px; }
	.chip-emoji { font-size: 14px; }
	.agent-model { flex: none; width: auto; max-width: 170px; background: var(--surface-2); border: 1px solid var(--border-soft); border-radius: 999px; color: var(--text-muted); font-size: 12px; padding: 5px 10px; }
	.agent-model:hover { border-color: var(--border); }
	.agent-model:focus { outline: none; border-color: var(--ember-line); }
	.x { flex: none; width: 26px; height: 26px; border-radius: 7px; border: 1px solid transparent; background: transparent; color: var(--text-faint); font-size: 18px; line-height: 1; transition: all 0.14s; }
	.x:hover { color: var(--danger); background: var(--danger-soft); }

	/* Add forms */
	.add-form { display: flex; gap: 10px; flex-wrap: wrap; }
	.add-form input { flex: 1; min-width: 140px; }
	.add-form.agent-form select { flex: 1; min-width: 160px; }

	/* Inputs (shared) */
	input[type='text'], textarea, select {
		width: 100%; background: var(--bg); border: 1px solid var(--border); border-radius: 9px; color: var(--text);
		padding: 10px 12px; font-family: var(--font-body); font-size: 13.5px;
	}
	textarea { resize: vertical; line-height: 1.5; }
	select { cursor: pointer; }
	input[type='text']:focus, textarea:focus, select:focus { outline: none; border-color: var(--ember-line); }
	input:disabled, textarea:disabled { opacity: 0.65; cursor: not-allowed; }

	/* Dialog */
	.overlay { position: fixed; inset: 0; background: rgba(8, 6, 4, 0.66); backdrop-filter: blur(3px); display: grid; place-items: center; padding: 20px; z-index: 100; }
	.dialog { width: 100%; max-width: 480px; max-height: 88vh; overflow-y: auto; background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 22px; box-shadow: var(--shadow); }
	.dhead { display: flex; align-items: center; gap: 12px; margin-bottom: 18px; }
	.dhead h3 { font-size: 16px; }
	.eyebrow { font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--text-faint); }
	.fields { display: flex; flex-direction: column; gap: 12px; }
	.fields .two { display: flex; gap: 12px; }
	.fields .two label:first-child { width: 80px; flex: none; }
	.fields .two label.grow { flex: 1; }
	.fields label span { display: block; font-size: 12.5px; color: var(--text-muted); margin-bottom: 5px; }
	.result { display: flex; align-items: center; gap: 8px; margin-top: 14px; padding: 11px 13px; border-radius: 10px; font-size: 13px; }
	.result.bad { background: var(--danger-soft); color: var(--danger); border: 1px solid var(--danger-soft); }
	.result span { font-weight: 700; }
	.dactions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px; }

	/* Knowledge base */
	.knowledge-field { gap: 6px; }
	.kn-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
	.kn-row .hint { margin: 0; }

	/* Commission whole company */
	.commission { background: var(--surface-1); border: 1px solid var(--ember-line); border-radius: var(--radius); padding: 16px 18px; margin-bottom: 18px; display: flex; flex-direction: column; gap: 12px; }
	.commission-head { display: flex; align-items: flex-start; gap: 10px; }
	.commission-head svg { width: 18px; height: 18px; color: var(--ember-bright); flex: none; margin-top: 1px; }
	.commission-head strong { font-size: 14px; display: block; }
	.commission-hint { font-size: 12px; color: var(--text-muted); }
	.commission textarea { width: 100%; }
	.commission-actions { display: flex; align-items: center; justify-content: flex-end; gap: 12px; }
	.working-note { font-size: 12.5px; color: var(--ember-bright); }
	.overall { background: var(--bg-veil); border: 1px solid var(--ember-line); border-radius: 10px; padding: 13px; }
	.overall-label { display: block; font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--ember-bright); margin-bottom: 7px; }
	.breakdown summary { cursor: pointer; font-size: 12.5px; color: var(--text-muted); font-family: var(--font-mono); list-style: none; user-select: none; }
	.breakdown summary::before { content: '▸ '; }
	.breakdown[open] summary::before { content: '▾ '; }
	.breakdown-body { display: flex; flex-direction: column; gap: 10px; margin-top: 10px; }
	.bd-item { background: var(--bg-veil); border: 1px solid var(--border-soft); border-radius: 9px; padding: 11px 13px; }
	.bd-head { display: flex; align-items: baseline; gap: 8px; margin-bottom: 5px; }
	.bd-head strong { font-size: 13px; }
	.bd-role { font-size: 11.5px; color: var(--text-faint); }
	.bd-task { margin: 0 0 7px; font-size: 12px; color: var(--text-muted); font-style: italic; }

	/* Agent wrap + tools panel */
	.agent-wrap { display: flex; flex-direction: column; }
	.tools-toggle.on { color: var(--ember-bright); border-color: var(--ember-line); }
	.tools-panel { background: var(--bg-veil); border: 1px solid var(--border-soft); border-top: none; border-radius: 0 0 var(--radius-sm) var(--radius-sm); padding: 12px 14px; margin: -2px 0 0; display: flex; flex-direction: column; gap: 12px; }
	.tools-hint { margin: 0; font-size: 12px; color: var(--text-muted); }
	.tools-hint em { color: var(--ember-bright); font-style: normal; }
	.tools-group { display: flex; flex-direction: column; gap: 7px; }
	.tools-group-title { font-size: 11px; text-transform: uppercase; letter-spacing: 0.09em; color: var(--text-faint); }
	.tools-checks { display: flex; flex-wrap: wrap; gap: 7px; }
	.tool-check { display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; color: var(--text-muted); background: var(--surface-2); border: 1px solid var(--border-soft); border-radius: 999px; padding: 5px 11px; cursor: pointer; transition: all 0.14s; }
	.tool-check:hover { border-color: var(--border); color: var(--text); }
	.tool-check input { width: auto; accent-color: var(--ember); }

	/* Task overlay: working + history */
	.task-working { display: flex; align-items: center; gap: 8px; margin-top: 12px; font-size: 12.5px; color: var(--ember-bright); }
	.task-working .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--ember); animation: pulseDot 1.2s infinite; }
	@keyframes pulseDot { 0%, 100% { opacity: 0.3; } 50% { opacity: 1; } }
	.hist-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin: 20px 0 8px; padding-top: 14px; border-top: 1px solid var(--border-soft); }
	.hist-title { font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--text-faint); font-family: var(--font-mono); }
	.hist-clear { font-size: 11.5px; color: var(--text-faint); background: transparent; border: 1px solid var(--border-soft); border-radius: 7px; padding: 4px 9px; transition: all 0.14s; }
	.hist-clear:hover { color: var(--danger); border-color: var(--danger-soft); }
	.hist-empty { margin: 0; font-size: 12.5px; color: var(--text-faint); }
	.hist-list { display: flex; flex-direction: column; gap: 9px; max-height: 320px; overflow-y: auto; }
	.hist-item { background: var(--bg-veil); border: 1px solid var(--border-soft); border-radius: 9px; padding: 10px 12px; }
	.hist-meta { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; margin-bottom: 6px; }
	.hist-task { font-size: 12.5px; font-weight: 600; color: var(--text); }
	.hist-time { font-size: 11px; color: var(--text-faint); flex: none; }

	/* Markdown rendering (scoped — mirror of chat .md) */
	.result-md { font-size: 13.5px; line-height: 1.6; }
	.result-md.small { font-size: 12.5px; }
	.md :global(p) { margin: 0 0 8px; }
	.md :global(p:last-child) { margin-bottom: 0; }
	.md :global(pre) { background: var(--surface-2); border: 1px solid var(--border-soft); border-radius: 8px; padding: 11px; overflow-x: auto; font-family: var(--font-mono); font-size: 12px; }
	.md :global(code) { font-family: var(--font-mono); font-size: 0.88em; background: var(--surface-3); padding: 1px 5px; border-radius: 4px; }
	.md :global(pre code) { background: none; padding: 0; }
	.md :global(a) { color: var(--ember-bright); text-decoration: underline; }
	.md :global(ul), .md :global(ol) { margin: 0 0 8px; padding-left: 20px; }
	.md :global(li) { margin-bottom: 3px; }
	.md :global(h1), .md :global(h2), .md :global(h3) { font-size: 1.05em; margin: 10px 0 5px; }
	.md :global(blockquote) { border-left: 2px solid var(--ember-line); margin: 0 0 8px; padding-left: 12px; color: var(--text-muted); }
	.md :global(table) { border-collapse: collapse; font-size: 12.5px; margin-bottom: 8px; }
	.md :global(th), .md :global(td) { border: 1px solid var(--border); padding: 4px 8px; }

	@media (max-width: 640px) {
		.company-head { grid-template-columns: 1fr; }
		.section-head { flex-direction: column; }
	}
</style>
