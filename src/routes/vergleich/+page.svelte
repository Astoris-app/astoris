<script lang="ts">
	import { onMount } from 'svelte';
	import AppHeader from '$lib/components/AppHeader.svelte';
	import { i18n } from '$lib/stores/i18n.svelte';
	import { dictation } from '$lib/actions/dictation';
	import { renderMarkdown } from '$lib/markdown';

	type ModelOption = { id: string; label: string; source: 'local' | 'cloud'; model: string };
	type Col = { label: string; source: 'local' | 'cloud'; model: string; reply?: string; ms?: number; error?: string; status: 'pending' | 'done' | 'error' };

	let available = $state<ModelOption[]>([]);
	let selected = $state<string[]>([]); // gewählte Modell-ids
	let query = $state('');
	let blind = $state(false);
	let running = $state(false);
	let cols = $state<Col[]>([]);
	let reveal = $state(true); // bei blind erst nach Klick true
	let done = $state(false);

	let synthesis = $state('');
	let synthLoading = $state(false);

	const LETTER = (i: number) => String.fromCharCode(65 + i);

	async function loadModels() {
		try {
			const d = await (await fetch('/api/models')).json();
			available = Array.isArray(d.models) ? d.models : [];
			// Vorauswahl: die ersten bis zu 3 Modelle.
			selected = available.slice(0, 3).map((m) => m.id);
		} catch { /* ignore */ }
	}

	function toggle(id: string) {
		if (selected.includes(id)) selected = selected.filter((x) => x !== id);
		else if (selected.length < 4) selected = [...selected, id];
	}

	function render(md: string): string { return renderMarkdown(md); }

	async function run() {
		const q = query.trim();
		const picks = available.filter((m) => selected.includes(m.id));
		if (!q || picks.length < 2 || running) return;
		running = true;
		done = false;
		synthesis = '';
		reveal = !blind;
		cols = picks.map((p) => ({ label: p.label, source: p.source, model: p.model, status: 'pending' }));
		try {
			const res = await fetch('/api/compare', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ query: q, models: picks.map((p) => ({ source: p.source, model: p.model, label: p.label })) })
			});
			if (!res.body) throw new Error('kein Stream');
			const reader = res.body.getReader();
			const dec = new TextDecoder();
			let buf = '';
			for (;;) {
				const { done: rdone, value } = await reader.read();
				if (rdone) break;
				buf += dec.decode(value, { stream: true });
				const parts = buf.split('\n\n');
				buf = parts.pop() ?? '';
				for (const p of parts) {
					const line = p.trim();
					if (!line.startsWith('data:')) continue;
					const js = line.slice(5).trim();
					if (!js) continue;
					try {
						const ev = JSON.parse(js);
						if (ev.type === 'answer') cols[ev.index] = { ...cols[ev.index], reply: ev.reply, ms: ev.ms, model: ev.model, status: 'done' };
						else if (ev.type === 'error') cols[ev.index] = { ...cols[ev.index], error: ev.message, status: 'error' };
						else if (ev.type === 'done') done = true;
					} catch { /* unvollständig */ }
				}
			}
		} catch { cols = cols.map((c) => c.status === 'pending' ? { ...c, error: i18n.t('compare.networkError'), status: 'error' } : c); }
		finally { running = false; }
	}

	async function evaluate() {
		const answers = cols.filter((c) => c.status === 'done' && c.reply).map((c) => ({ reply: c.reply as string }));
		if (answers.length < 2 || synthLoading) return;
		synthLoading = true;
		synthesis = '';
		try {
			const d = await (await fetch('/api/compare', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ action: 'synthesize', query: query.trim(), answers })
			})).json();
			synthesis = d.synthesis ? render(d.synthesis) : '';
		} catch { synthesis = ''; }
		finally { synthLoading = false; }
	}

	function onKey(e: KeyboardEvent) { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) run(); }

	let canRun = $derived(query.trim().length > 0 && selected.length >= 2 && !running);
	let doneCount = $derived(cols.filter((c) => c.status === 'done').length);

	onMount(loadModels);
</script>

<div class="amain">
	<AppHeader title={i18n.t('compare.title')} eyebrow={i18n.t('compare.eyebrow')} />

	<div class="scroll">
		{#if available.length < 2}
			<div class="notice">{i18n.t('compare.noModels')}</div>
		{:else}
			<div class="controls">
				<div class="searchbar">
					<svg class="ico" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 9h8M8 13h5"/><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v7A2.5 2.5 0 0 1 17.5 15H9l-4.2 3.4A.6.6 0 0 1 4 17.9z"/></svg>
					<input
						type="text"
						bind:value={query}
						onkeydown={onKey}
						use:dictation={{ getText: () => query, append: (s) => query = (query ? query + ' ' : '') + s }}
						placeholder={i18n.t('compare.placeholder')}
						aria-label={i18n.t('compare.placeholder')}
					/>
					<button class="btn primary" onclick={run} disabled={!canRun}>{running ? i18n.t('compare.running') : i18n.t('compare.run')}</button>
				</div>

				<div class="picker">
					<span class="plabel">{i18n.t('compare.selectModels')}</span>
					<div class="chips">
						{#each available as m (m.id)}
							<button
								class="chip"
								class:on={selected.includes(m.id)}
								disabled={!selected.includes(m.id) && selected.length >= 4}
								onclick={() => toggle(m.id)}
							>{m.label}</button>
						{/each}
					</div>
					<label class="blindtoggle">
						<input type="checkbox" bind:checked={blind} />
						<span>{i18n.t('compare.blind')}</span>
					</label>
				</div>
			</div>

			{#if cols.length}
				{#if blind && !reveal && doneCount > 0}
					<div class="revealbar">
						<span>{i18n.t('compare.blindHint')}</span>
						<button class="btn ghost sm" onclick={() => (reveal = true)}>{i18n.t('compare.reveal')}</button>
					</div>
				{/if}

				<div class="grid" style="--cols:{cols.length}">
					{#each cols as c, i (i)}
						<article class="col" class:err={c.status === 'error'}>
							<header class="chead">
								<span class="cname">{#if blind && !reveal}{i18n.t('compare.modelLetter')} {LETTER(i)}{:else}{c.label}{/if}</span>
								{#if c.status === 'done' && c.ms}<span class="cms">{(c.ms / 1000).toFixed(1)}s</span>{/if}
							</header>
							{#if c.status === 'pending'}
								<div class="cwait"><span class="spinner"></span>{i18n.t('compare.waiting')}</div>
							{:else if c.status === 'error'}
								<div class="cerr">{c.error}</div>
							{:else}
								<div class="cbody">{@html render(c.reply || '')}</div>
							{/if}
						</article>
					{/each}
				</div>

				{#if done && doneCount >= 2}
					<div class="synthwrap">
						{#if !synthesis && !synthLoading}
							<button class="btn ghost" onclick={evaluate}>{i18n.t('compare.evaluate')}</button>
						{:else if synthLoading}
							<div class="cwait"><span class="spinner"></span>{i18n.t('compare.evaluating')}</div>
						{:else}
							<section class="verdict">
								<h3 class="ptitle">{i18n.t('compare.verdict')}</h3>
								<div class="vbody">{@html synthesis}</div>
							</section>
						{/if}
					</div>
				{/if}
			{:else}
				<div class="empty">
					<svg class="big-ico" viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 5h7v14H4zM13 5h7v14h-7z"/></svg>
					<p class="empty-lead">{i18n.t('compare.emptyLead')}</p>
				</div>
			{/if}
		{/if}
	</div>
</div>

<style>
	.amain { flex: 1; display: flex; flex-direction: column; min-width: 0; min-height: 0; }
	.scroll { flex: 1; overflow-y: auto; padding: 24px 28px 40px; }

	.controls { max-width: 860px; margin: 0 auto; }
	.searchbar { display: flex; align-items: center; gap: 10px; padding: 8px 8px 8px 14px; background: var(--surface-1); border: 1px solid var(--border); border-radius: var(--radius); }
	.searchbar:focus-within { border-color: var(--ember-line); }
	.searchbar .ico { color: var(--text-faint); flex: none; }
	.searchbar input { flex: 1; background: transparent; border: none; outline: none; color: var(--text); font-family: var(--font-body); font-size: 15px; padding: 6px 0; }
	.searchbar input::placeholder { color: var(--text-faint); }

	.btn { font-family: var(--font-body); font-size: 14px; padding: 9px 18px; border-radius: var(--radius-sm); border: 1px solid transparent; cursor: pointer; flex: none; }
	.btn.primary { background: var(--ember); color: var(--bg); font-weight: 600; }
	.btn.primary:hover:not(:disabled) { background: var(--ember-bright); }
	.btn.ghost { background: var(--surface-2); color: var(--text-muted); border-color: var(--border-soft); }
	.btn.ghost:hover { color: var(--text); border-color: var(--border); }
	.btn.sm { padding: 6px 12px; font-size: 13px; }
	.btn:disabled { opacity: 0.5; cursor: default; }

	.picker { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-top: 12px; }
	.plabel { font-size: 12px; font-family: var(--font-mono); text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-faint); }
	.chips { display: flex; flex-wrap: wrap; gap: 8px; }
	.chip { padding: 7px 14px; background: var(--surface-2); border: 1px solid var(--border-soft); border-radius: 999px; color: var(--text-muted); font-family: var(--font-body); font-size: 13px; cursor: pointer; transition: all 0.14s; }
	.chip:hover:not(:disabled) { border-color: var(--ember-line); color: var(--text); }
	.chip.on { background: var(--ember-soft); border-color: var(--ember-line); color: var(--ember-bright); }
	.chip:disabled { opacity: 0.4; cursor: default; }
	.blindtoggle { display: flex; align-items: center; gap: 6px; font-size: 13px; color: var(--text-muted); cursor: pointer; margin-left: auto; }
	.blindtoggle input { accent-color: var(--ember); }

	.revealbar { display: flex; align-items: center; gap: 12px; justify-content: center; max-width: 860px; margin: 20px auto 0; color: var(--text-faint); font-size: 12.5px; }

	.grid { display: grid; grid-template-columns: repeat(var(--cols), minmax(0, 1fr)); gap: 14px; margin: 20px auto 0; max-width: 1400px; }
	@media (max-width: 900px) { .grid { grid-template-columns: 1fr; } }
	.col { display: flex; flex-direction: column; background: var(--surface-1); border: 1px solid var(--border-soft); border-radius: var(--radius); overflow: hidden; }
	.col.err { border-color: color-mix(in srgb, red 30%, var(--border)); }
	.chead { display: flex; align-items: center; justify-content: space-between; padding: 11px 14px; border-bottom: 1px solid var(--border-soft); background: var(--surface-2); }
	.cname { font-size: 13.5px; font-weight: 600; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.cms { font-size: 11px; font-family: var(--font-mono); color: var(--sage); flex: none; }
	.cwait { display: flex; align-items: center; gap: 9px; padding: 20px 14px; color: var(--text-muted); font-size: 13.5px; }
	.cerr { padding: 16px 14px; color: color-mix(in srgb, red 70%, var(--text)); font-size: 13.5px; }
	.cbody { padding: 14px 16px; color: var(--text); font-size: 14px; line-height: 1.65; overflow-wrap: anywhere; }
	.cbody :global(h1), .cbody :global(h2), .cbody :global(h3) { font-size: 15px; margin: 0.9em 0 0.4em; }
	.cbody :global(p) { margin: 0.6em 0; }
	.cbody :global(ul), .cbody :global(ol) { margin: 0.6em 0; padding-left: 1.3em; }
	.cbody :global(pre) { background: var(--surface-2); border-radius: 6px; padding: 10px; overflow-x: auto; }
	.cbody :global(code) { background: var(--surface-2); border-radius: 4px; padding: 1px 5px; font-family: var(--font-mono); font-size: 0.9em; }

	.spinner { width: 15px; height: 15px; border: 2px solid var(--border); border-top-color: var(--ember); border-radius: 50%; animation: spin 0.7s linear infinite; flex: none; }
	@keyframes spin { to { transform: rotate(360deg); } }

	.synthwrap { display: flex; justify-content: center; max-width: 860px; margin: 22px auto 0; }
	.verdict { width: 100%; padding: 18px 20px; background: var(--surface-1); border: 1px solid var(--border); border-radius: var(--radius); }
	.ptitle { margin: 0 0 10px; font-size: 11px; font-family: var(--font-mono); text-transform: uppercase; letter-spacing: 0.1em; color: var(--text-faint); font-weight: 600; }
	.vbody { color: var(--text); font-size: 14.5px; line-height: 1.65; }
	.vbody :global(p) { margin: 0.5em 0; }
	.vbody :global(strong) { color: var(--ember-bright); }

	.notice { max-width: 720px; margin: 24px auto 0; padding: 16px 18px; background: var(--surface-1); border: 1px solid var(--border-soft); border-radius: var(--radius-sm); color: var(--text-muted); font-size: 14px; }
	.empty { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 10px; margin-top: 64px; color: var(--text-muted); }
	.big-ico { color: var(--text-faint); }
	.empty-lead { font-size: 15px; color: var(--text); max-width: 440px; }
</style>
