<script lang="ts">
	import { onMount } from 'svelte';
	import AppHeader from '$lib/components/AppHeader.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import CodeEditor from '$lib/components/CodeEditor.svelte';
	import InfoHint from '$lib/components/InfoHint.svelte';
	import { i18n } from '$lib/stores/i18n.svelte';
	import { dictation } from '$lib/actions/dictation';

	const DEFAULT_ICON = 'M4 8V5a1 1 0 0 1 1-1h3a2 2 0 1 1 4 0h3a1 1 0 0 1 1 1v3a2 2 0 1 0 0 4v3a1 1 0 0 1-1 1h-3a2 2 0 1 0-4 0H5a1 1 0 0 1-1-1v-3a2 2 0 1 1 0-4z';

	let plugins = $state<any[]>([]);
	let err = $state('');
	let fileInput = $state<HTMLInputElement>();

	// Suche / Filter / Sortierung (lokaler UI-State, keine Server-Felder erfunden).
	let q = $state('');
	let fStatus = $state<'all' | 'on' | 'off'>('all');
	let fKind = $state<'all' | 'free' | 'premium'>('all');
	let fType = $state<'all' | 'agent-tool' | 'connector'>('all');
	let sort = $state<'name-asc' | 'name-desc' | 'enabled'>('name-asc');

	// Typ-Filter nur zeigen, wenn beide Typen wirklich vorkommen.
	const hasCode = $derived(plugins.some((p) => p.type === 'agent-tool'));
	const hasConnector = $derived(plugins.some((p) => p.type === 'connector'));
	const showTypeFilter = $derived(hasCode && hasConnector);

	const filtered = $derived.by(() => {
		const needle = q.trim().toLowerCase();
		const byName = (a: any, b: any) => String(a.name ?? '').localeCompare(String(b.name ?? ''));
		const list = plugins.filter((p) => {
			if (needle) {
				const hay = (String(p.name ?? '') + ' ' + String(p.description ?? '')).toLowerCase();
				if (!hay.includes(needle)) return false;
			}
			if (fStatus === 'on' && !p.enabled) return false;
			if (fStatus === 'off' && p.enabled) return false;
			if (fKind === 'free' && p.premium) return false;
			if (fKind === 'premium' && !p.premium) return false;
			if (showTypeFilter && fType !== 'all' && p.type !== fType) return false;
			return true;
		});
		if (sort === 'name-asc') return [...list].sort(byName);
		if (sort === 'name-desc') return [...list].sort((a, b) => byName(b, a));
		// 'enabled': aktivierte zuerst, dann alphabetisch.
		return [...list].sort((a, b) => (b.enabled ? 1 : 0) - (a.enabled ? 1 : 0) || byName(a, b));
	});

	// Editor-State
	type ConfigField = { key: string; label: string; type: 'text' | 'password' | 'url'; placeholder?: string; optional?: boolean; hint?: string };
	let editor = $state<{ isNew: boolean; id: string; name: string; code: string; description?: string; inputHint?: string; configFields?: ConfigField[]; configKeys?: string[] } | null>(null);

	// KI-Generator-Dialog
	let aiOpen = $state(false);
	let aiDesc = $state('');
	let aiBusy = $state(false);
	let aiErr = $state('');
	let testInput = $state('');
	let testRes = $state('');
	let notice = $state('');
	let cfgValues = $state<Record<string, string>>({});
	let cfgNotice = $state('');
	// Doppelklick-Guards: laufende Requests sperren die jeweilige Aktion.
	let saving = $state(false);
	let savingCfg = $state(false);
	let cardBusy = $state<string | null>(null);

	async function load() {
		try { const d = await (await fetch('/api/plugins')).json(); plugins = d.plugins ?? []; } catch { /* ignore */ }
	}
	onMount(load);

	async function onUpload(e: Event) {
		err = '';
		const f = (e.target as HTMLInputElement).files?.[0];
		if (!f) return;
		try {
			const manifest = JSON.parse(await f.text());
			const res = await fetch('/api/plugins', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'upload', manifest }) });
			const d = await res.json().catch(() => ({}));
			if (!res.ok) err = d.message ?? i18n.t('erweiterungen.invalid'); else await load();
		} catch { err = i18n.t('erweiterungen.invalid'); }
		if (fileInput) fileInput.value = '';
	}
	async function toggle(p: any) {
		if (cardBusy) return;
		cardBusy = p.id;
		try {
			await fetch('/api/plugins', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'toggle', id: p.id, enabled: !p.enabled }) });
			await load();
		} finally { cardBusy = null; }
	}
	async function license(p: any) {
		if (cardBusy) return;
		cardBusy = p.id;
		try {
			await fetch('/api/plugins', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'license', id: p.id, licensed: true }) });
			await load();
		} finally { cardBusy = null; }
	}
	async function removeAddon(id: string) {
		if (cardBusy) return;
		if (!confirm(i18n.t('erweiterungen.removeConfirm'))) return;
		cardBusy = id;
		try {
			await fetch('/api/plugins', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'remove', id }) });
			await load();
		} finally { cardBusy = null; }
	}

	function newCode() {
		notice = ''; testRes = ''; testInput = '';
		editor = { isNew: true, id: '', name: '', code: i18n.t('erweiterungen.codePlaceholder') };
	}

	// KI-Generator: öffnet den Dialog, generiert ein Add-on und lädt es in den Editor (isNew).
	function openAi() { aiErr = ''; aiDesc = ''; aiOpen = true; }
	function closeAi() { if (aiBusy) return; aiOpen = false; }
	async function generateAi() {
		if (aiBusy) return;
		aiErr = '';
		if (!aiDesc.trim()) { aiErr = i18n.t('erweiterungen.aiEmpty'); return; }
		aiBusy = true;
		try {
			const res = await fetch('/api/plugins', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'generate-addon', description: aiDesc }) });
			const d = await res.json().catch(() => ({}));
			if (!res.ok || d.ok === false || !d.addon) { aiErr = d.message ?? i18n.t('erweiterungen.aiFailed'); return; }
			// Erfolg: Ergebnis in den bestehenden Code-Editor laden (testen/bearbeiten/speichern).
			notice = ''; testRes = ''; testInput = '';
			editor = { isNew: true, id: d.addon.id ?? '', name: d.addon.name ?? '', code: d.addon.code ?? '', description: d.addon.description, inputHint: d.addon.inputHint };
			aiOpen = false;
		} catch {
			aiErr = i18n.t('erweiterungen.aiFailed');
		} finally {
			aiBusy = false;
		}
	}
	async function editCode(p: any) {
		notice = ''; testRes = ''; testInput = ''; cfgNotice = ''; cfgValues = {};
		try {
			const d = await (await fetch('/api/plugins?id=' + encodeURIComponent(p.id))).json();
			editor = { isNew: false, id: d.plugin.id, name: d.plugin.name, code: d.plugin.code ?? '', configFields: d.plugin.configFields ?? [], configKeys: d.configKeys ?? [] };
		} catch { err = i18n.t('erweiterungen.invalid'); }
	}
	function closeEditor() { editor = null; }

	async function runTest() {
		if (!editor) return;
		testRes = '…';
		let input: unknown = undefined;
		if (testInput.trim()) { try { input = JSON.parse(testInput); } catch { testRes = i18n.t('erweiterungen.testInvalidJson'); return; } }
		try {
			const res = await fetch('/api/plugins', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'run', code: editor.code, input }) });
			const d = await res.json();
			testRes = d.ok ? JSON.stringify(d.output, null, 2) : '⚠ ' + (d.error ?? i18n.t('erweiterungen.error'));
		} catch { testRes = '⚠ ' + i18n.t('erweiterungen.runFailed'); }
	}
	async function saveCode() {
		if (!editor || saving) return;
		saving = true;
		notice = '';
		try {
			const body = editor.isNew
				? { action: 'upload', manifest: { id: editor.id, name: editor.name || editor.id, version: '1.0.0', type: 'agent-tool', code: editor.code, ...(editor.description ? { description: editor.description } : {}), ...(editor.inputHint ? { inputHint: editor.inputHint } : {}) } }
				: { action: 'save-code', id: editor.id, code: editor.code };
			const res = await fetch('/api/plugins', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
			const d = await res.json().catch(() => ({}));
			if (!res.ok) { notice = '⚠ ' + (d.message ?? i18n.t('erweiterungen.invalid')); return; }
			notice = i18n.t('erweiterungen.saved');
			await load();
			if (editor.isNew) editor = { ...editor, isNew: false };
		} finally { saving = false; }
	}
	async function saveConfig() {
		if (!editor || !editor.configFields?.length || savingCfg) return;
		savingCfg = true;
		cfgNotice = '';
		try {
			const config: Record<string, string> = {};
			for (const f of editor.configFields) {
				const v = cfgValues[f.key];
				if (v != null && v.trim() !== '') config[f.key] = v;
			}
			const secretKeys = editor.configFields.filter((f) => f.type === 'password').map((f) => f.key);
			const res = await fetch('/api/plugins', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'set-config', id: editor.id, config, secretKeys }) });
			const d = await res.json().catch(() => ({}));
			if (!res.ok) { cfgNotice = '⚠ ' + (d.message ?? i18n.t('erweiterungen.invalid')); return; }
			await editCode({ id: editor.id }); // reload configKeys + clear fields
			cfgNotice = i18n.t('erweiterungen.configSaved');
		} finally { savingCfg = false; }
	}
</script>

<AppHeader title={i18n.t('erweiterungen.title')} eyebrow={i18n.t('erweiterungen.eyebrow')}>
	<a class="hbtn" href="https://astoris.org/erweiterungen" target="_blank" rel="noopener">
		<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3"/></svg>
		{i18n.t('erweiterungen.more')}
	</a>
	<button class="hbtn ai" onclick={openAi}>
		<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9zM19 14l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/></svg>
		{i18n.t('erweiterungen.aiCreate')}
	</button>
	<button class="hbtn" onclick={newCode}>
		<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M16 18l6-6-6-6M8 6l-6 6 6 6"/></svg>
		{i18n.t('erweiterungen.createCode')}
	</button>
	<button class="hbtn ember" onclick={() => fileInput?.click()}>
		<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4M7 9l5-5 5 5M5 20h14"/></svg>
		{i18n.t('erweiterungen.upload')}
	</button>
	<input type="file" accept=".json,application/json" bind:this={fileInput} onchange={onUpload} hidden />
</AppHeader>

<div class="scroll">
	<p class="intro">{i18n.t('erweiterungen.intro')}</p>
	{#if err}<div class="err">{err}</div>{/if}

	{#if plugins.length === 0}
		<div class="empty">
			<div class="bigico"><Icon path={DEFAULT_ICON} size={26} /></div>
			<p>{i18n.t('erweiterungen.none')}</p>
			<small class="mono">{i18n.t('erweiterungen.uploadHint')}</small>
		</div>
	{:else}
		<div class="toolbar">
			<div class="search">
				<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
				<input
					type="search"
					bind:value={q}
					placeholder={i18n.t('erweiterungen.search')}
					aria-label={i18n.t('erweiterungen.searchLabel')}
					use:dictation={{ getText: () => q, append: (s) => (q = (q ? q + ' ' : '') + s) }}
				/>
				{#if q}<button class="clear" onclick={() => (q = '')} aria-label={i18n.t('erweiterungen.clearSearch')} type="button">✕</button>{/if}
			</div>

			<div class="chips">
				<div class="seg" role="group" aria-label={i18n.t('erweiterungen.filterStatus')}>
					<button class:active={fStatus === 'all'} onclick={() => (fStatus = 'all')} type="button">{i18n.t('erweiterungen.all')}</button>
					<button class:active={fStatus === 'on'} onclick={() => (fStatus = 'on')} type="button">{i18n.t('erweiterungen.statusOn')}</button>
					<button class:active={fStatus === 'off'} onclick={() => (fStatus = 'off')} type="button">{i18n.t('erweiterungen.statusOff')}</button>
				</div>
				<div class="seg" role="group" aria-label={i18n.t('erweiterungen.filterKind')}>
					<button class:active={fKind === 'all'} onclick={() => (fKind = 'all')} type="button">{i18n.t('erweiterungen.all')}</button>
					<button class:active={fKind === 'free'} onclick={() => (fKind = 'free')} type="button">{i18n.t('erweiterungen.free')}</button>
					<button class:active={fKind === 'premium'} onclick={() => (fKind = 'premium')} type="button">{i18n.t('erweiterungen.premium')}</button>
				</div>
				{#if showTypeFilter}
					<div class="seg" role="group" aria-label={i18n.t('erweiterungen.filterType')}>
						<button class:active={fType === 'all'} onclick={() => (fType = 'all')} type="button">{i18n.t('erweiterungen.all')}</button>
						<button class:active={fType === 'agent-tool'} onclick={() => (fType = 'agent-tool')} type="button">{i18n.t('erweiterungen.codeType')}</button>
						<button class:active={fType === 'connector'} onclick={() => (fType = 'connector')} type="button">{i18n.t('erweiterungen.connectorType')}</button>
					</div>
				{/if}
			</div>

			<select class="sort" bind:value={sort} aria-label={i18n.t('erweiterungen.sortLabel')}>
				<option value="name-asc">{i18n.t('erweiterungen.sortNameAsc')}</option>
				<option value="name-desc">{i18n.t('erweiterungen.sortNameDesc')}</option>
				<option value="enabled">{i18n.t('erweiterungen.sortEnabled')}</option>
			</select>
		</div>

		<div class="count mono">{filtered.length} {i18n.t('erweiterungen.resultsOf')} {plugins.length} {i18n.t('erweiterungen.resultsUnit')}</div>

		{#if filtered.length === 0}
			<div class="empty">
				<div class="bigico"><Icon path={DEFAULT_ICON} size={26} /></div>
				<p>{i18n.t('erweiterungen.noResults')}</p>
			</div>
		{:else}
		<div class="grid">
			{#each filtered as p (p.id)}
				<article class="card" class:on={p.enabled}>
					<div class="top">
						<div class="ico"><Icon path={p.icon || DEFAULT_ICON} size={20} /></div>
						<div class="badges">
							{#if p.type === 'agent-tool'}<span class="badge code">{i18n.t('erweiterungen.codeBadge')}</span>{/if}
							<span class="badge" class:prem={p.premium}>{p.premium ? i18n.t('erweiterungen.premium') : i18n.t('erweiterungen.free')}</span>
						</div>
					</div>
					<h3>{p.name}</h3>
					{#if p.description}<p class="desc">{p.description}</p>{/if}
					<div class="meta mono">{p.type} · v{p.version}</div>
					{#if p.premium && !p.licensed}<div class="premlock">🔒 {i18n.t('erweiterungen.premiumLocked')}</div>{/if}
					<div class="acts">
						{#if p.premium && !p.licensed}
							<button class="btn primary" onclick={() => license(p)} disabled={cardBusy === p.id}>{i18n.t('erweiterungen.unlock')}</button>
						{:else}
							<button class="btn" class:primary={!p.enabled} onclick={() => toggle(p)} disabled={cardBusy === p.id}>{p.enabled ? i18n.t('erweiterungen.deactivate') : i18n.t('erweiterungen.activate')}</button>
						{/if}
						{#if p.type === 'agent-tool'}<button class="btn" onclick={() => editCode(p)}>{i18n.t('erweiterungen.edit')}</button>{/if}
						<button class="btn ghost" onclick={() => removeAddon(p.id)} disabled={cardBusy === p.id}>{i18n.t('erweiterungen.remove')}</button>
					</div>
				</article>
			{/each}
		</div>
		{/if}
	{/if}
</div>

{#if aiOpen}
	<div class="overlay" onclick={closeAi} role="presentation"></div>
	<div class="aimodal" role="dialog" aria-modal="true" aria-label={i18n.t('erweiterungen.aiTitle')}>
		<header>
			<h2>
				<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9zM19 14l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/></svg>
				{i18n.t('erweiterungen.aiTitle')}
			</h2>
			<button class="x" onclick={closeAi} aria-label={i18n.t('erweiterungen.close')} disabled={aiBusy}>✕</button>
		</header>
		<div class="aibody">
			<label class="full">{i18n.t('erweiterungen.aiPrompt')}
				<textarea
					class="aidesc"
					bind:value={aiDesc}
					rows="4"
					placeholder={i18n.t('erweiterungen.aiPlaceholder')}
					disabled={aiBusy}
					use:dictation={{ getText: () => aiDesc, append: (s) => (aiDesc = (aiDesc ? aiDesc + ' ' : '') + s) }}
				></textarea>
			</label>
			<p class="aihint">{i18n.t('erweiterungen.aiHint')}</p>
			{#if aiErr}<div class="aierr">{aiErr}</div>{/if}
		</div>
		<footer>
			<button class="btn" onclick={closeAi} disabled={aiBusy}>{i18n.t('erweiterungen.close')}</button>
			<button class="btn primary" onclick={generateAi} disabled={aiBusy || !aiDesc.trim()}>
				{aiBusy ? i18n.t('erweiterungen.aiGenerating') : i18n.t('erweiterungen.aiGenerate')}
			</button>
		</footer>
	</div>
{/if}

{#if editor}
	<div class="overlay" onclick={closeEditor} role="presentation"></div>
	<aside class="slide">
		<header>
			<h2>{i18n.t('erweiterungen.editorTitle')}</h2>
			<button class="x" onclick={closeEditor} aria-label={i18n.t('erweiterungen.close')}>✕</button>
		</header>
		<div class="body">
			<div class="warn">{i18n.t('erweiterungen.codeWarn')}</div>
			<div class="row">
				<label>{i18n.t('erweiterungen.nameLabel')} <InfoHint text={i18n.t('erweiterungen.nameHint')} /><input bind:value={editor.name} placeholder={i18n.t('erweiterungen.addonNamePlaceholder')} /></label>
				{#if editor.isNew}<label>{i18n.t('erweiterungen.idLabel')} <InfoHint text={i18n.t('erweiterungen.idHint')} /><input bind:value={editor.id} placeholder={i18n.t('erweiterungen.addonIdPlaceholder')} /></label>{/if}
			</div>
			<label class="full">{i18n.t('erweiterungen.codeLabel')} <InfoHint text={i18n.t('erweiterungen.codeHint')} />
				<CodeEditor bind:value={editor.code} placeholder={i18n.t('erweiterungen.codePlaceholder')} />
			</label>
			<label class="full">{i18n.t('erweiterungen.testInput')} <InfoHint text={i18n.t('erweiterungen.testHint')} />
				<input class="mono" bind:value={testInput} placeholder={'{ "name": "Welt" }'} />
			</label>
			{#if testRes}<pre class="out">{testRes}</pre>{/if}
			{#if editor.configFields?.length}
				<div class="cfg">
					<h3>{i18n.t('erweiterungen.configTitle')}</h3>
					<p class="cfghint">{i18n.t('erweiterungen.configHint')}</p>
					{#each editor.configFields as field (field.key)}
						<label class="full">
							{field.label}
							{#if field.hint}<InfoHint text={field.hint} />{/if}
							<input
								type={field.type === 'password' ? 'password' : 'text'}
								bind:value={cfgValues[field.key]}
								placeholder={editor.configKeys?.includes(field.key) ? '•••••• (gespeichert)' : (field.placeholder ?? '')}
							/>
						</label>
					{/each}
					<div class="cfgfoot">
						{#if cfgNotice}<span class="notice">{cfgNotice}</span>{/if}
						<button class="btn primary" onclick={saveConfig} disabled={savingCfg}>{i18n.t('erweiterungen.configSave')}</button>
					</div>
				</div>
			{/if}
		</div>
		<footer>
			{#if notice}<span class="notice">{notice}</span>{/if}
			<button class="btn" onclick={runTest}>{i18n.t('erweiterungen.run')}</button>
			<button class="btn primary" onclick={saveCode} disabled={saving}>{i18n.t('erweiterungen.save')}</button>
		</footer>
	</aside>
{/if}

<style>
	.hbtn { display: inline-flex; align-items: center; gap: 7px; font-size: 12.5px; color: var(--text-muted); background: transparent; border: 1px solid var(--border); border-radius: 999px; padding: 6px 13px; transition: all 0.16s; }
	.hbtn:hover { color: var(--text); border-color: var(--text-faint); }
	.hbtn.ember { color: var(--ember-bright); background: var(--ember-soft); border-color: var(--ember-line); }
	.hbtn.ember:hover { background: var(--ember); color: #1a1206; }
	.hbtn.ai { color: var(--sage); background: var(--sage-soft); border-color: color-mix(in srgb, var(--sage) 30%, transparent); }
	.hbtn.ai:hover { color: var(--text); border-color: var(--sage); }
	/* KI-Generator-Dialog (zentriert, über dem Overlay) */
	.aimodal { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); width: min(540px, 94vw); max-height: 90vh; background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius); z-index: 42; display: flex; flex-direction: column; box-shadow: 0 30px 70px -25px rgba(0,0,0,0.6); }
	.aimodal header { display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; border-bottom: 1px solid var(--border-soft); }
	.aimodal header h2 { display: flex; align-items: center; gap: 9px; font-size: 16px; }
	.aimodal header h2 svg { color: var(--sage); flex: none; }
	.aibody { padding: 18px 20px; display: flex; flex-direction: column; gap: 12px; overflow-y: auto; }
	.aidesc { width: 100%; background: var(--surface-1); border: 1px solid var(--border); border-radius: 11px; padding: 11px 13px; color: var(--text); font-size: 14px; font-family: var(--font-body); line-height: 1.5; resize: vertical; min-height: 90px; }
	.aidesc:focus { outline: none; border-color: var(--ember-line); }
	.aidesc:disabled { opacity: 0.6; }
	.aihint { margin: 0; font-size: 12px; color: var(--text-faint); }
	.aierr { background: var(--danger-soft); color: var(--danger); border-radius: 9px; padding: 9px 12px; font-size: 12.5px; }
	.aimodal footer { display: flex; align-items: center; justify-content: flex-end; gap: 10px; padding: 14px 20px; border-top: 1px solid var(--border-soft); }
	.scroll { flex: 1; overflow-y: auto; padding: 24px 28px 40px; }
	.intro { color: var(--text-muted); max-width: 640px; margin: 0 0 22px; }
	.err { background: var(--danger-soft); color: var(--danger); border-radius: var(--radius); padding: 11px 14px; font-size: 13px; margin-bottom: 18px; }
	.empty { text-align: center; padding: 60px 20px; color: var(--text-muted); display: flex; flex-direction: column; align-items: center; gap: 10px; }
	.bigico { width: 56px; height: 56px; display: grid; place-items: center; border-radius: 16px; color: var(--ember-bright); background: var(--ember-soft); border: 1px solid var(--ember-line); }
	.empty small { font-size: 11px; color: var(--text-faint); }
	/* Such-/Filterleiste */
	.toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin-bottom: 14px; }
	.search { position: relative; display: flex; align-items: center; flex: 1 1 240px; min-width: 200px; }
	.search > svg { position: absolute; left: 12px; color: var(--text-faint); pointer-events: none; }
	.search input { width: 100%; background: var(--surface-1); border: 1px solid var(--border); border-radius: 999px; padding: 9px 34px 9px 34px; color: var(--text); font-size: 13px; }
	.search input:focus { outline: none; border-color: var(--ember-line); }
	.search input::-webkit-search-cancel-button { display: none; }
	.clear { position: absolute; right: 6px; width: 24px; height: 24px; border-radius: 999px; border: none; background: transparent; color: var(--text-faint); font-size: 12px; cursor: pointer; }
	.clear:hover { color: var(--text); background: var(--surface-2); }
	.chips { display: flex; flex-wrap: wrap; gap: 8px; }
	.seg { display: inline-flex; background: var(--surface-1); border: 1px solid var(--border-soft); border-radius: 999px; padding: 2px; gap: 2px; }
	.seg button { font-size: 12px; color: var(--text-muted); background: transparent; border: none; border-radius: 999px; padding: 5px 12px; white-space: nowrap; transition: all 0.16s; cursor: pointer; }
	.seg button:hover { color: var(--text); }
	.seg button.active { color: #1a1206; background: var(--ember); }
	.sort { background: var(--surface-1); border: 1px solid var(--border); border-radius: 999px; padding: 8px 13px; color: var(--text); font-size: 12.5px; cursor: pointer; }
	.sort:focus { outline: none; border-color: var(--ember-line); }
	.count { font-size: 11px; color: var(--text-faint); margin: 0 0 14px; }
	@media (max-width: 560px) {
		.toolbar { flex-direction: column; align-items: stretch; }
		.chips { overflow-x: auto; flex-wrap: nowrap; padding-bottom: 2px; -webkit-overflow-scrolling: touch; }
		.sort { width: 100%; }
	}
	.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 12px; }
	.card { background: var(--surface-1); border: 1px solid var(--border-soft); border-radius: var(--radius); padding: 16px; display: flex; flex-direction: column; gap: 7px; }
	.card.on { box-shadow: inset 2px 0 0 var(--sage); }
	.top { display: flex; align-items: center; justify-content: space-between; }
	.ico { width: 38px; height: 38px; display: grid; place-items: center; border-radius: 10px; color: var(--ember-bright); background: var(--ember-soft); }
	.badges { display: flex; gap: 5px; }
	.badge { font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-faint); border: 1px solid var(--border-soft); padding: 2px 8px; border-radius: 999px; }
	.badge.prem { color: var(--ember-bright); border-color: var(--ember-line); }
	.badge.code { color: var(--sage); border-color: var(--sage-soft); }
	.card h3 { font-size: 15.5px; }
	.desc { margin: 0; font-size: 13px; color: var(--text-muted); flex: 1; }
	.meta { font-size: 10.5px; color: var(--text-faint); }
	.acts { display: flex; gap: 8px; margin-top: 6px; flex-wrap: wrap; }
	.premlock { font-size: 12px; color: var(--text); background: var(--ember-soft); border: 1px solid var(--ember-line); border-radius: 8px; padding: 6px 10px; margin: 4px 0; }
	.btn { border-radius: 9px; padding: 7px 13px; font-size: 12.5px; font-weight: 500; border: 1px solid var(--border); background: transparent; color: var(--text-muted); transition: all 0.16s; }
	.btn.primary { background: var(--ember); color: #1a1206; border-color: transparent; }
	.btn.ghost:hover { color: var(--danger); border-color: var(--danger-soft); }
	.btn:not(.primary):not(.ghost):hover { color: var(--text); border-color: var(--text-faint); }
	/* Slide-over */
	.overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.45); z-index: 40; }
	.slide { position: fixed; top: 0; right: 0; bottom: 0; width: min(620px, 94vw); background: var(--bg); border-left: 1px solid var(--border); z-index: 41; display: flex; flex-direction: column; box-shadow: -20px 0 50px -20px rgba(0,0,0,0.5); }
	.slide header { display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; border-bottom: 1px solid var(--border-soft); }
	.slide header h2 { font-size: 16px; }
	.x { width: 32px; height: 32px; border-radius: 8px; color: var(--text-muted); background: transparent; border: none; font-size: 14px; }
	.x:hover { background: var(--surface-2); color: var(--text); }
	.body { flex: 1; overflow-y: auto; padding: 18px 20px; display: flex; flex-direction: column; gap: 14px; }
	.warn { background: var(--ember-soft); color: var(--text); border: 1px solid var(--ember-line); border-radius: var(--radius); padding: 10px 13px; font-size: 12.5px; font-weight: 500; }
	.row { display: flex; gap: 12px; }
	.row label { flex: 1; }
	label { display: flex; flex-direction: column; gap: 6px; font-size: 12px; color: var(--text-muted); }
	label.full { width: 100%; }
	input { background: var(--surface-1); border: 1px solid var(--border); border-radius: 9px; padding: 9px 12px; color: var(--text); font-size: 13px; }
	input:focus { outline: none; border-color: var(--ember-line); }
	.out { background: var(--surface-2); border: 1px solid var(--border-soft); border-radius: var(--radius); padding: 12px 14px; font-size: 12px; color: var(--text); overflow-x: auto; max-height: 200px; white-space: pre-wrap; word-break: break-word; }
	.cfg { display: flex; flex-direction: column; gap: 12px; padding-top: 16px; border-top: 1px solid var(--border-soft); }
	.cfg h3 { font-size: 14px; color: var(--text); }
	.cfghint { margin: 0; font-size: 12px; color: var(--text-muted); }
	.cfgfoot { display: flex; align-items: center; gap: 10px; margin-top: 4px; }
	.cfgfoot .btn.primary { margin-left: auto; }
	.slide footer { display: flex; align-items: center; gap: 10px; padding: 14px 20px; border-top: 1px solid var(--border-soft); }
	.slide footer .btn { margin-left: 0; }
	.slide footer .btn.primary { margin-left: auto; }
	.notice { font-size: 12.5px; color: var(--sage); margin-right: auto; }
</style>
