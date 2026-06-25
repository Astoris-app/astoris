<script lang="ts">
	import { onMount } from 'svelte';
	import AppHeader from '$lib/components/AppHeader.svelte';

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
	type SubAgent = { id: string; name: string; role: string; personaId: string; status: string };
	type Company = {
		name: string;
		industry: string;
		mission: string;
		roles: Role[];
		agents: SubAgent[];
	};
	type Template = { label: string; roles: { title: string; description: string }[] };

	// ---------- State ----------
	let tab = $state<'personas' | 'company'>('personas');

	let personas = $state<Persona[]>([]);
	let company = $state<Company>({ name: '', industry: '', mission: '', roles: [], agents: [] });
	let templates = $state<Record<string, Template>>({});
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
				agents: Array.isArray(c.agents) ? c.agents : []
			};
			templates = data?.templates && typeof data.templates === 'object' ? data.templates : {};
			// sync head form
			cName = company.name;
			cIndustry = company.industry;
			cMission = company.mission;
		} catch {
			company = { name: '', industry: '', mission: '', roles: [], agents: [] };
			templates = {};
		}
	}

	onMount(async () => {
		await Promise.all([loadPersonas(), loadCompany()]);
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
			editor.error = 'Name ist erforderlich.';
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
				editor.error = 'Speichern fehlgeschlagen.';
				editor.busy = false;
				return;
			}
			await loadPersonas();
			closeEditor();
		} catch {
			editor.error = 'Netzwerkfehler.';
		} finally {
			editor.busy = false;
		}
	}

	async function deletePersona(p: Persona) {
		if (p.builtin) return;
		if (!confirm(`Persönlichkeit „${p.name}" löschen?`)) return;
		try {
			await fetch(`/api/personas?id=${encodeURIComponent(p.id)}`, { method: 'DELETE' });
			await loadPersonas();
		} catch {
			/* offline ok */
		}
	}

	// ---------- Company actions ----------
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
				const c = data.company;
				company = {
					name: c.name ?? '',
					industry: c.industry ?? '',
					mission: c.mission ?? '',
					roles: Array.isArray(c.roles) ? c.roles : [],
					agents: Array.isArray(c.agents) ? c.agents : []
				};
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

	let taskAgent = $state<SubAgent | null>(null);
	let taskInput = $state('');
	let taskResult = $state('');
	let taskBusy = $state(false);
	function openTask(a: SubAgent) { taskAgent = a; taskInput = ''; taskResult = ''; }
	async function runTask() {
		if (!taskAgent || !taskInput.trim() || taskBusy) return;
		taskBusy = true; taskResult = '';
		try {
			const r = await fetch('/api/company', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'run-agent', agentId: taskAgent.id, task: taskInput }) });
			const d = await r.json();
			taskResult = d.result ?? d.error ?? 'Keine Antwort.';
		} catch { taskResult = 'Fehler bei der Ausführung.'; }
		finally { taskBusy = false; }
	}
</script>

<AppHeader title="Team" eyebrow="Persönlichkeiten & Firma" />

<div class="scroll">
	<!-- Tab switcher -->
	<div class="tabs" role="tablist">
		<button class="tab" class:on={tab === 'personas'} role="tab" aria-selected={tab === 'personas'} onclick={() => (tab = 'personas')}>
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
				<circle cx="12" cy="8" r="3.5" />
				<path d="M5 20c0-3.3 3.1-6 7-6s7 2.7 7 6" />
			</svg>
			Persönlichkeiten
		</button>
		<button class="tab" class:on={tab === 'company'} role="tab" aria-selected={tab === 'company'} onclick={() => (tab = 'company')}>
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
				<path d="M4 21V6a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v15" />
				<path d="M14 9h4a2 2 0 0 1 2 2v10" />
				<path d="M3 21h18" />
				<path d="M7.5 8h.01M7.5 12h.01M10.5 8h.01M10.5 12h.01M7.5 16h3" />
			</svg>
			Firma
		</button>
	</div>

	{#if loading}
		<p class="muted">Lade …</p>
	{:else if tab === 'personas'}
		<!-- =================== PERSONAS =================== -->
		<div class="section-head">
			<p class="lead">
				Persönlichkeiten geben deinen Agenten Charakter und Haltung. Vorlagen sind eingebaut; eigene
				kannst du frei gestalten und jederzeit anpassen.
			</p>
			<button class="btn primary" onclick={openCreate}>
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
					<path d="M12 5v14M5 12h14" />
				</svg>
				Neue Persönlichkeit
			</button>
		</div>

		{#if personas.length === 0}
			<div class="empty">
				<span class="big">🪄</span>
				<h3>Noch keine Persönlichkeiten</h3>
				<p>Lege deine erste Persönlichkeit an und gib ihr Stimme und Auftrag.</p>
				<button class="btn primary" onclick={openCreate}>Erste Persönlichkeit anlegen</button>
			</div>
		{:else}
			<div class="grid">
				{#each personas as p (p.id)}
					<article class="card persona">
						<div class="top">
							<span class="emoji">{p.emoji || '🙂'}</span>
							{#if p.builtin}<span class="badge">Vorlage</span>{/if}
						</div>
						<h3>{p.name}</h3>
						<p class="tag">{p.tagline || '—'}</p>
						{#if p.systemPrompt}<p class="prompt">{p.systemPrompt}</p>{/if}
						<div class="actions">
							{#if p.builtin}
								<button class="btn ghost" onclick={() => openEdit(p)}>Ansehen</button>
							{:else}
								<button class="btn ghost" onclick={() => openEdit(p)}>Bearbeiten</button>
								<button class="btn danger-ghost" onclick={() => deletePersona(p)}>Löschen</button>
							{/if}
						</div>
					</article>
				{/each}
			</div>
		{/if}
	{:else}
		<!-- =================== COMPANY =================== -->
		<section class="block">
			<h2 class="cat">Firma</h2>
			<div class="company-head">
				<div class="field">
					<label for="c-name">Name</label>
					<input id="c-name" type="text" placeholder="z. B. Astoris Werkstatt" bind:value={cName} autocomplete="off" />
				</div>
				<div class="field">
					<label for="c-industry">Branche</label>
					<select id="c-industry" bind:value={cIndustry}>
						<option value="">Eigene / keine</option>
						{#each templateKeys as key (key)}
							<option value={key}>{templates[key].label}</option>
						{/each}
					</select>
				</div>
				<div class="field full">
					<label for="c-mission">Mission</label>
					<textarea id="c-mission" rows="3" placeholder="Wofür steht deine Firma? Was soll das Team erreichen?" bind:value={cMission}></textarea>
				</div>
				<div class="head-actions">
					<button class="btn primary" onclick={saveCompany} disabled={savingCompany}>
						{savingCompany ? 'Speichere …' : 'Speichern'}
					</button>
					{#if activeTemplate}
						<button class="btn ghost" onclick={applyTemplate}>
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
								<path d="M12 3v6m0 0 3-3m-3 3L9 6" />
								<path d="M4 13v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" />
							</svg>
							Rollen aus Vorlage übernehmen
						</button>
					{/if}
				</div>
				{#if activeTemplate}
					<p class="hint mono">Vorlage „{activeTemplate.label}" schlägt {activeTemplate.roles.length} Rollen vor.</p>
				{/if}
			</div>
		</section>

		<!-- Roles -->
		<section class="block">
			<h2 class="cat">Rollen</h2>
			{#if company.roles.length === 0}
				<div class="empty small">
					<span class="big">🧩</span>
					<p>Noch keine Rollen. Lege Rollen an oder übernimm eine Branchen-Vorlage.</p>
				</div>
			{:else}
				<div class="list">
					{#each company.roles as r (r.id)}
						<div class="row">
							<div class="row-main">
								<strong>{r.title}</strong>
								{#if r.description}<span class="row-sub">{r.description}</span>{/if}
							</div>
							<button class="x" aria-label="Rolle entfernen" onclick={() => removeRole(r.id)}>×</button>
						</div>
					{/each}
				</div>
			{/if}
			<div class="add-form">
				<input type="text" placeholder="Rollen-Titel" bind:value={roleTitle} autocomplete="off" />
				<input type="text" placeholder="Beschreibung (optional)" bind:value={roleDesc} autocomplete="off" />
				<button class="btn ghost" onclick={addRole} disabled={!roleTitle.trim()}>Hinzufügen</button>
			</div>
		</section>

		<!-- Sub-agents -->
		<section class="block">
			<h2 class="cat">Unteragenten</h2>
			{#if company.agents.length === 0}
				<div class="empty small">
					<span class="big">🤝</span>
					<p>Noch keine Unteragenten. Stelle dein Team zusammen — gib jedem eine Rolle und eine Persönlichkeit.</p>
				</div>
			{:else}
				<div class="list">
					{#each company.agents as a (a.id)}
						{@const persona = personaById(a.personaId)}
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
									<span class="muted">keine Persona</span>
								{/if}
							</div>
							<button class="task-btn" title="Aufgabe geben" onclick={() => openTask(a)}>Aufgabe</button>
							<button class="x" aria-label="Agent entfernen" onclick={() => removeAgent(a.id)}>×</button>
						</div>
					{/each}
				</div>
			{/if}
			<div class="add-form agent-form">
				<input type="text" placeholder="Name" bind:value={agentName} autocomplete="off" />
				<input type="text" placeholder="Rolle" bind:value={agentRole} list="role-suggestions" autocomplete="off" />
				<datalist id="role-suggestions">
					{#each company.roles as r (r.id)}<option value={r.title}></option>{/each}
				</datalist>
				<select bind:value={agentPersona}>
					<option value="">Persönlichkeit wählen …</option>
					{#each personas as p (p.id)}
						<option value={p.id}>{(p.emoji || '🙂') + ' ' + p.name}</option>
					{/each}
				</select>
				<button class="btn ghost" onclick={addAgent} disabled={!agentName.trim()}>Anlegen</button>
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
			aria-label="Persönlichkeit bearbeiten"
			tabindex="-1"
			onclick={(e) => e.stopPropagation()}
			onkeydown={() => {}}
		>
			<div class="dhead">
				<span class="emoji big">{editor.emoji || '🙂'}</span>
				<div>
					<h3>{editor.id ? (readOnly ? 'Persönlichkeit ansehen' : 'Persönlichkeit bearbeiten') : 'Neue Persönlichkeit'}</h3>
					<span class="eyebrow">{readOnly ? 'Eingebaute Vorlage · schreibgeschützt' : 'Charakter & Auftrag'}</span>
				</div>
			</div>

			<div class="fields">
				<div class="two">
					<label>
						<span>Emoji</span>
						<input type="text" maxlength="4" placeholder="🙂" bind:value={editor.emoji} disabled={readOnly} autocomplete="off" />
					</label>
					<label class="grow">
						<span>Name</span>
						<input type="text" placeholder="z. B. Strategin" bind:value={editor.name} disabled={readOnly} autocomplete="off" />
					</label>
				</div>
				<label>
					<span>Tagline</span>
					<input type="text" placeholder="Kurzbeschreibung in einem Satz" bind:value={editor.tagline} disabled={readOnly} autocomplete="off" />
				</label>
				<label>
					<span>System-Prompt</span>
					<textarea rows="6" placeholder="Wie soll diese Persönlichkeit denken, antworten, sich verhalten?" bind:value={editor.systemPrompt} disabled={readOnly}></textarea>
				</label>
			</div>

			{#if editor.error}
				<div class="result bad"><span>✕</span>{editor.error}</div>
			{/if}

			<div class="dactions">
				<button class="btn ghost" onclick={closeEditor}>{readOnly ? 'Schließen' : 'Abbrechen'}</button>
				{#if !readOnly}
					<button class="btn primary" onclick={savePersona} disabled={editor.busy}>
						{editor.busy ? 'Speichere …' : editor.id ? 'Änderungen speichern' : 'Anlegen'}
					</button>
				{/if}
			</div>
		</div>
	</div>
{/if}

{#if taskAgent}
	<div class="task-overlay" role="button" tabindex="0" onclick={() => (taskAgent = null)} onkeydown={(e) => e.key === 'Escape' && (taskAgent = null)}>
		<div class="task-dialog" role="dialog" aria-modal="true" tabindex="-1" onclick={(e) => e.stopPropagation()} onkeydown={() => {}}>
			<h3>Aufgabe für {taskAgent.name}</h3>
			<p class="task-role">{taskAgent.role}</p>
			<textarea bind:value={taskInput} rows="3" placeholder="Was soll {taskAgent.name} erledigen?"></textarea>
			<div class="task-actions">
				<button class="tbtn ghost" onclick={() => (taskAgent = null)}>Schließen</button>
				<button class="tbtn primary" onclick={runTask} disabled={taskBusy || !taskInput.trim()}>{taskBusy ? 'Arbeitet …' : 'Ausführen'}</button>
			</div>
			{#if taskResult}<div class="task-result">{taskResult}</div>{/if}
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
	.task-result { margin-top: 16px; padding: 13px; background: var(--bg-veil); border: 1px solid var(--border-soft); border-radius: 10px; font-size: 13.5px; line-height: 1.6; white-space: pre-wrap; max-height: 300px; overflow-y: auto; }
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

	@media (max-width: 640px) {
		.company-head { grid-template-columns: 1fr; }
		.section-head { flex-direction: column; }
	}
</style>
