<script lang="ts">
	import { onMount } from 'svelte';
	import AppHeader from '$lib/components/AppHeader.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import CodeEditor from '$lib/components/CodeEditor.svelte';
	import InfoHint from '$lib/components/InfoHint.svelte';
	import { i18n } from '$lib/stores/i18n.svelte';

	const DEFAULT_ICON = 'M4 8V5a1 1 0 0 1 1-1h3a2 2 0 1 1 4 0h3a1 1 0 0 1 1 1v3a2 2 0 1 0 0 4v3a1 1 0 0 1-1 1h-3a2 2 0 1 0-4 0H5a1 1 0 0 1-1-1v-3a2 2 0 1 1 0-4z';

	let plugins = $state<any[]>([]);
	let err = $state('');
	let fileInput = $state<HTMLInputElement>();

	// Editor-State
	let editor = $state<{ isNew: boolean; id: string; name: string; code: string } | null>(null);
	let testInput = $state('');
	let testRes = $state('');
	let notice = $state('');

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
		await fetch('/api/plugins', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'toggle', id: p.id, enabled: !p.enabled }) });
		await load();
	}
	async function license(p: any) {
		await fetch('/api/plugins', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'license', id: p.id, licensed: true }) });
		await load();
	}
	async function removeAddon(id: string) {
		await fetch('/api/plugins', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'remove', id }) });
		await load();
	}

	function newCode() {
		notice = ''; testRes = ''; testInput = '';
		editor = { isNew: true, id: '', name: '', code: i18n.t('erweiterungen.codePlaceholder') };
	}
	async function editCode(p: any) {
		notice = ''; testRes = ''; testInput = '';
		try {
			const d = await (await fetch('/api/plugins?id=' + encodeURIComponent(p.id))).json();
			editor = { isNew: false, id: d.plugin.id, name: d.plugin.name, code: d.plugin.code ?? '' };
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
		if (!editor) return;
		notice = '';
		const body = editor.isNew
			? { action: 'upload', manifest: { id: editor.id, name: editor.name || editor.id, version: '1.0.0', type: 'agent-tool', code: editor.code } }
			: { action: 'save-code', id: editor.id, code: editor.code };
		const res = await fetch('/api/plugins', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
		const d = await res.json().catch(() => ({}));
		if (!res.ok) { notice = '⚠ ' + (d.message ?? i18n.t('erweiterungen.invalid')); return; }
		notice = i18n.t('erweiterungen.saved');
		await load();
		if (editor.isNew) editor = { ...editor, isNew: false };
	}
</script>

<AppHeader title={i18n.t('erweiterungen.title')} eyebrow={i18n.t('erweiterungen.eyebrow')}>
	<a class="hbtn" href="https://astoris.org/erweiterungen" target="_blank" rel="noopener">
		<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3"/></svg>
		{i18n.t('erweiterungen.more')}
	</a>
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
		<div class="grid">
			{#each plugins as p (p.id)}
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
							<button class="btn primary" onclick={() => license(p)}>{i18n.t('erweiterungen.unlock')}</button>
						{:else}
							<button class="btn" class:primary={!p.enabled} onclick={() => toggle(p)}>{p.enabled ? i18n.t('erweiterungen.deactivate') : i18n.t('erweiterungen.activate')}</button>
						{/if}
						{#if p.type === 'agent-tool'}<button class="btn" onclick={() => editCode(p)}>{i18n.t('erweiterungen.edit')}</button>{/if}
						<button class="btn ghost" onclick={() => removeAddon(p.id)}>{i18n.t('erweiterungen.remove')}</button>
					</div>
				</article>
			{/each}
		</div>
	{/if}
</div>

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
				<label>{i18n.t('erweiterungen.nameLabel')} <InfoHint text={i18n.t('erweiterungen.nameHint')} /><input bind:value={editor.name} placeholder="Mein Add-on" /></label>
				{#if editor.isNew}<label>{i18n.t('erweiterungen.idLabel')} <InfoHint text={i18n.t('erweiterungen.idHint')} /><input bind:value={editor.id} placeholder="mein-addon" /></label>{/if}
			</div>
			<label class="full">{i18n.t('erweiterungen.codeLabel')} <InfoHint text={i18n.t('erweiterungen.codeHint')} />
				<CodeEditor bind:value={editor.code} placeholder={i18n.t('erweiterungen.codePlaceholder')} />
			</label>
			<label class="full">{i18n.t('erweiterungen.testInput')} <InfoHint text={i18n.t('erweiterungen.testHint')} />
				<input class="mono" bind:value={testInput} placeholder={'{ "name": "Welt" }'} />
			</label>
			{#if testRes}<pre class="out">{testRes}</pre>{/if}
		</div>
		<footer>
			{#if notice}<span class="notice">{notice}</span>{/if}
			<button class="btn" onclick={runTest}>{i18n.t('erweiterungen.run')}</button>
			<button class="btn primary" onclick={saveCode}>{i18n.t('erweiterungen.save')}</button>
		</footer>
	</aside>
{/if}

<style>
	.hbtn { display: inline-flex; align-items: center; gap: 7px; font-size: 12.5px; color: var(--text-muted); background: transparent; border: 1px solid var(--border); border-radius: 999px; padding: 6px 13px; transition: all 0.16s; }
	.hbtn:hover { color: var(--text); border-color: var(--text-faint); }
	.hbtn.ember { color: var(--ember-bright); background: var(--ember-soft); border-color: var(--ember-line); }
	.hbtn.ember:hover { background: var(--ember); color: #1a1206; }
	.scroll { flex: 1; overflow-y: auto; padding: 24px 28px 40px; }
	.intro { color: var(--text-muted); max-width: 640px; margin: 0 0 22px; }
	.err { background: var(--danger-soft); color: var(--danger); border-radius: var(--radius); padding: 11px 14px; font-size: 13px; margin-bottom: 18px; }
	.empty { text-align: center; padding: 60px 20px; color: var(--text-muted); display: flex; flex-direction: column; align-items: center; gap: 10px; }
	.bigico { width: 56px; height: 56px; display: grid; place-items: center; border-radius: 16px; color: var(--ember-bright); background: var(--ember-soft); border: 1px solid var(--ember-line); }
	.empty small { font-size: 11px; color: var(--text-faint); }
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
	.slide footer { display: flex; align-items: center; gap: 10px; padding: 14px 20px; border-top: 1px solid var(--border-soft); }
	.slide footer .btn { margin-left: 0; }
	.slide footer .btn.primary { margin-left: auto; }
	.notice { font-size: 12.5px; color: var(--sage); margin-right: auto; }
</style>
