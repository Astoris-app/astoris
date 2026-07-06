<script lang="ts">
	import { onMount } from 'svelte';
	import AppHeader from '$lib/components/AppHeader.svelte';
	import ResearchSidebar from '$lib/components/ResearchSidebar.svelte';
	import { i18n } from '$lib/stores/i18n.svelte';
	import { dictation } from '$lib/actions/dictation';
	import { renderMarkdown } from '$lib/markdown';

	type Result = { title: string; url: string; snippet: string };
	type HistoryEntry = { id: string; query: string; title?: string; at: string; favorite: boolean; resultCount?: number };
	type Step = { key: string; label: string; status: 'running' | 'done'; detail?: string };
	type Source = { n: number; title: string; url: string; verified?: boolean };

	let mode = $state<'quick' | 'deep'>('quick');

	let query = $state('');
	let results = $state<Result[]>([]);
	let loading = $state(false);
	let error = $state('');
	let searched = $state(false);

	// --- Deep Research state ---
	let depth = $state<'schnell' | 'ausgewogen' | 'gruendlich'>('ausgewogen');
	let deepModel = $state<'local' | 'cloud'>('local');
	let steps = $state<Step[]>([]);
	let subqueries = $state<string[]>([]);
	let deepSources = $state<Source[]>([]);
	let reportHtml = $state('');
	let reportModel = $state('');
	let deepLoading = $state(false);
	let deepError = $state('');
	let deepDone = $state(false);
	let ctrl: AbortController | null = null;

	type SavedReport = { id: string; query: string; at: string; model: string; depth: string; sourceCount: number };
	let savedReports = $state<SavedReport[]>([]);
	let loadedReport = $state(false); // zeigt ein aus dem Archiv geladener (nicht frisch recherchierter) Bericht

	let history = $state<HistoryEntry[]>([]);
	let activeQuery = $state('');
	let histNavOpen = $state(false);
	function closeHistNav() { histNavOpen = false; }
	function onPageKeydown(e: KeyboardEvent) { if (e.key === 'Escape') histNavOpen = false; }

	const examples = $derived([
		i18n.t('research.example1'),
		i18n.t('research.example2'),
		i18n.t('research.example3'),
		i18n.t('research.example4')
	]);

	async function loadHistory() {
		try {
			const d = await (await fetch('/api/research/history')).json();
			history = Array.isArray(d.history) ? d.history : [];
		} catch { /* ignore */ }
	}

	async function loadReports() {
		try {
			const d = await (await fetch('/api/research/reports')).json();
			savedReports = Array.isArray(d.reports) ? d.reports : [];
		} catch { /* ignore */ }
	}

	// Gespeicherten Bericht anzeigen — ohne neue Recherche.
	async function openReport(id: string) {
		try {
			const d = await (await fetch('/api/research/reports?id=' + encodeURIComponent(id))).json();
			const r = d.report;
			if (!r) return;
			query = r.query;
			activeQuery = r.query;
			reportHtml = renderReport(r.markdown || '');
			deepSources = Array.isArray(r.sources) ? r.sources : [];
			reportModel = r.model || '';
			steps = [];
			subqueries = [];
			deepError = '';
			deepDone = true;
			loadedReport = true;
			searched = true;
		} catch { deepError = i18n.t('research.networkError'); }
	}

	async function deleteReport(id: string) {
		await fetch('/api/research/reports', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'delete', id }) });
		await loadReports();
	}

	function fmtDate(iso: string): string {
		try { return new Date(iso).toLocaleString(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch { return ''; }
	}

	// --- Schnellsuche (unverändert) ---
	async function search() {
		const q = query.trim();
		if (!q || loading) return;
		loading = true;
		error = '';
		searched = true;
		activeQuery = q;
		try {
			const res = await fetch('/api/research', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ query: q })
			});
			const data = await res.json();
			results = Array.isArray(data.results) ? data.results : [];
			error = data.error ?? '';
		} catch {
			results = [];
			error = i18n.t('research.networkError');
		} finally {
			loading = false;
			loadHistory();
		}
	}

	// --- Deep Research: SSE-Stream Schritt für Schritt lesen ---
	function upsertStep(ev: { key: string; label: string; status: 'start' | 'done'; detail?: string }) {
		const status = ev.status === 'done' ? 'done' : 'running';
		const i = steps.findIndex((s) => s.key === ev.key);
		if (i >= 0) steps[i] = { key: ev.key, label: ev.label, status, detail: ev.detail ?? steps[i].detail };
		else steps.push({ key: ev.key, label: ev.label, status, detail: ev.detail });
	}

	function renderReport(md: string): string {
		// Fußnoten [n] nach der Sanitization in klickbare Sprungmarken wandeln (nur Ziffern → sicher).
		return renderMarkdown(md).replace(/\[(\d+)\]/g, (_m, n) => `<a class="fn" href="#src-${n}">[${n}]</a>`);
	}

	function handleEvent(ev: any) {
		switch (ev.type) {
			case 'step': upsertStep(ev); break;
			case 'subqueries': subqueries = Array.isArray(ev.queries) ? ev.queries : []; break;
			case 'sources': deepSources = Array.isArray(ev.sources) ? ev.sources : []; break;
			case 'report':
				reportHtml = renderReport(ev.markdown || '');
				deepSources = Array.isArray(ev.sources) ? ev.sources : deepSources;
				reportModel = ev.model || '';
				break;
			case 'error': deepError = ev.message || 'Fehler'; break;
			case 'done': deepDone = true; break;
		}
	}

	async function deepSearch() {
		const q = query.trim();
		if (!q || deepLoading) return;
		deepLoading = true;
		deepError = '';
		deepDone = false;
		loadedReport = false;
		steps = [];
		subqueries = [];
		deepSources = [];
		reportHtml = '';
		reportModel = '';
		searched = true;
		activeQuery = q;
		ctrl = new AbortController();
		try {
			const res = await fetch('/api/research/deep', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ query: q, depth, override: deepModel === 'cloud' ? { source: 'cloud', model: '' } : null }),
				signal: ctrl.signal
			});
			if (!res.body) throw new Error('kein Stream');
			const reader = res.body.getReader();
			const dec = new TextDecoder();
			let buf = '';
			for (;;) {
				const { done, value } = await reader.read();
				if (done) break;
				buf += dec.decode(value, { stream: true });
				const parts = buf.split('\n\n');
				buf = parts.pop() ?? '';
				for (const p of parts) {
					const line = p.trim();
					if (!line.startsWith('data:')) continue;
					const js = line.slice(5).trim();
					if (!js) continue;
					try { handleEvent(JSON.parse(js)); } catch { /* unvollständig */ }
				}
			}
		} catch (e) {
			if (!(e instanceof Error && e.name === 'AbortError')) deepError = i18n.t('research.networkError');
		} finally {
			deepLoading = false;
			ctrl = null;
			loadHistory();
			loadReports();
		}
	}

	function cancelDeep() {
		ctrl?.abort();
		deepLoading = false;
	}

	function run() {
		if (mode === 'deep') deepSearch();
		else search();
	}
	function onKey(e: KeyboardEvent) { if (e.key === 'Enter') run(); }

	function useExample(q: string) { query = q; run(); }
	function selectHistory(q: string) { query = q; closeHistNav(); run(); }

	async function renameHistory(id: string, title: string) {
		await fetch('/api/research/history', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'rename', id, title }) });
		await loadHistory();
	}
	async function toggleFavorite(id: string, favorite: boolean) {
		await fetch('/api/research/history', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'favorite', id, favorite }) });
		await loadHistory();
	}
	async function deleteHistory(id: string) {
		await fetch('/api/research/history', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'delete', id }) });
		await loadHistory();
	}
	async function clearHistory() {
		await fetch('/api/research/history', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'clear' }) });
		await loadHistory();
	}

	function domain(url: string): string {
		try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
	}

	onMount(() => { loadHistory(); loadReports(); });
</script>

<svelte:window onkeydown={onPageKeydown} />

<div class="alayout">
	<ResearchSidebar
		history={history}
		activeQuery={activeQuery}
		mobileOpen={histNavOpen}
		onSelect={selectHistory}
		onRename={renameHistory}
		onToggleFavorite={toggleFavorite}
		onDelete={deleteHistory}
		onClear={clearHistory}
	/>
	{#if histNavOpen}
		<button class="app-backdrop" aria-label={i18n.t('common.cancel')} onclick={closeHistNav}></button>
	{/if}
	<div class="amain">
		<AppHeader title={i18n.t('research.title')} eyebrow={i18n.t('research.eyebrow')}>
			<button class="histbtn" aria-label={i18n.t('research.historyTitle')} aria-expanded={histNavOpen} onclick={() => (histNavOpen = !histNavOpen)}>
				<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v5h5M3.05 13A9 9 0 1 0 6 5.3L3 8"/><path d="M12 7v5l3 2"/></svg>
				{i18n.t('research.historyTitle')}
			</button>
		</AppHeader>

		<div class="scroll">
			<!-- Modus-Umschalter -->
			<div class="modes">
				<button class="seg" class:on={mode === 'quick'} onclick={() => (mode = 'quick')}>{i18n.t('research.mode_quick')}</button>
				<button class="seg" class:on={mode === 'deep'} onclick={() => (mode = 'deep')}>{i18n.t('research.mode_deep')}</button>
			</div>

			<div class="searchbar">
				<svg class="ico" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
					<circle cx="11" cy="11" r="7" />
					<path d="m21 21-4.3-4.3" />
				</svg>
				<input
					type="text"
					bind:value={query}
					onkeydown={onKey}
					use:dictation={{ getText: () => query, append: (s) => query = (query ? query + ' ' : '') + s }}
					placeholder={mode === 'deep' ? i18n.t('research.deep_placeholder') : i18n.t('research.searchPlaceholder')}
					aria-label={i18n.t('research.searchLabel')}
				/>
				{#if mode === 'deep' && deepLoading}
					<button class="btn ghost" onclick={cancelDeep}>{i18n.t('research.deep_cancel')}</button>
				{:else}
					<button class="btn primary" onclick={run} disabled={(mode === 'deep' ? deepLoading : loading) || !query.trim()}>
						{#if mode === 'deep'}{deepLoading ? i18n.t('research.deep_running') : i18n.t('research.deep_start')}{:else}{loading ? i18n.t('research.searching') : i18n.t('research.search')}{/if}
					</button>
				{/if}
			</div>

			{#if mode === 'deep'}
				<!-- Deep-Optionen -->
				<div class="opts">
					<label class="opt">
						<span>{i18n.t('research.deep_depth')}</span>
						<select bind:value={depth} disabled={deepLoading}>
							<option value="schnell">{i18n.t('research.depth_schnell')}</option>
							<option value="ausgewogen">{i18n.t('research.depth_ausgewogen')}</option>
							<option value="gruendlich">{i18n.t('research.depth_gruendlich')}</option>
						</select>
					</label>
					<div class="mtoggle" role="group" aria-label="Modell">
						<button class="mt" class:on={deepModel === 'local'} disabled={deepLoading} onclick={() => (deepModel = 'local')}>{i18n.t('research.deep_model_local')}</button>
						<button class="mt" class:on={deepModel === 'cloud'} disabled={deepLoading} onclick={() => (deepModel = 'cloud')}>{i18n.t('research.deep_model_cloud')}</button>
					</div>
				</div>
			{/if}

			<!-- Ergebnisbereich -->
			{#if mode === 'quick'}
				{#if loading}
					<div class="state-line"><span class="spinner" aria-hidden="true"></span><span>{i18n.t('research.browsing')}</span></div>
				{:else if error && results.length === 0}
					<div class="notice">{error}</div>
				{:else if results.length > 0}
					<p class="meta">{results.length} {i18n.t('research.hitsFound')}</p>
					<div class="list">
						{#each results as r (r.url)}
							<article class="card">
								<a class="title" href={r.url} target="_blank" rel="noopener">{r.title}</a>
								<span class="url">{domain(r.url)}</span>
								{#if r.snippet}<p class="snip">{r.snippet}</p>{/if}
							</article>
						{/each}
					</div>
				{:else if !searched}
					<div class="empty">
						<svg class="big-ico" viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
							<circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" />
						</svg>
						<p class="empty-lead">{i18n.t('research.emptyLead')}</p>
						<p class="empty-sub">{i18n.t('research.emptySub')}</p>
						<div class="chips">
							{#each examples as ex (ex)}<button class="chip" onclick={() => useExample(ex)}>{ex}</button>{/each}
						</div>
					</div>
				{/if}
			{:else}
				<!-- Deep Research -->
				{#if !searched}
					<div class="empty">
						<svg class="big-ico" viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
							<path d="M12 3a9 9 0 1 0 9 9" /><path d="M12 7v5l3 2" />
						</svg>
						<p class="empty-lead">{i18n.t('research.deep_lead')}</p>
						<p class="empty-sub">{i18n.t('research.deep_empty')}</p>
						<div class="chips">
							{#each examples as ex (ex)}<button class="chip" onclick={() => useExample(ex)}>{ex}</button>{/each}
						</div>
					</div>
				{:else}
					{#if loadedReport}
						<div class="loaded-hint">
							<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>
							{i18n.t('research.deep_loaded')} · {activeQuery}
						</div>
					{/if}
					{#if steps.length}
						<section class="panel">
							<h3 class="ptitle">{i18n.t('research.deep_steps')}</h3>
							<ol class="steps">
								{#each steps as s (s.key)}
									<li class="step" class:done={s.status === 'done'}>
										<span class="marker" aria-hidden="true">
											{#if s.status === 'done'}
												<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
											{:else}
												<span class="spinner sm"></span>
											{/if}
										</span>
										<span class="slabel">{s.label}</span>
										{#if s.detail}<span class="sdetail">{s.detail}</span>{/if}
									</li>
								{/each}
							</ol>
							{#if subqueries.length}
								<div class="subq">
									{#each subqueries as q (q)}<span class="qchip">{q}</span>{/each}
								</div>
							{/if}
						</section>
					{/if}

					{#if deepError}
						<div class="notice">{deepError}</div>
					{/if}

					{#if reportHtml}
						<article class="report">
							<div class="rbody">{@html reportHtml}</div>
						</article>
					{/if}

					{#if deepSources.length}
						<section class="panel sources">
							<h3 class="ptitle">{i18n.t('research.deep_sources')} · {deepSources.length}{#if reportModel} · {reportModel}{/if}</h3>
							<ol class="srclist">
								{#each deepSources as s (s.n)}
									<li id={`src-${s.n}`} class="src">
										<span class="sn">{s.n}</span>
										<div class="sinfo">
											<a class="stitle" href={s.url} target="_blank" rel="noopener">{s.title}</a>
											<span class="surl">{domain(s.url)}</span>
										</div>
										{#if s.verified}<span class="badge" title={i18n.t('research.deep_verified')}>✓ {i18n.t('research.deep_verified')}</span>{/if}
									</li>
								{/each}
							</ol>
						</section>
					{/if}
				{/if}

				{#if savedReports.length && !deepLoading}
					<section class="panel saved">
						<h3 class="ptitle">{i18n.t('research.deep_saved')} · {savedReports.length}</h3>
						<ul class="savedlist">
							{#each savedReports as r (r.id)}
								<li class="saveditem">
									<button class="openrep" onclick={() => openReport(r.id)}>
										<span class="sq">{r.query}</span>
										<span class="smeta">{fmtDate(r.at)} · {r.sourceCount} {i18n.t('research.deep_sources')}{#if r.model} · {r.model}{/if}</span>
									</button>
									<button class="del" title={i18n.t('research.delete')} aria-label={i18n.t('research.delete')} onclick={() => deleteReport(r.id)}>
										<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"/></svg>
									</button>
								</li>
							{/each}
						</ul>
					</section>
				{/if}
			{/if}
		</div>
	</div>
</div>

<style>
	.alayout { display: flex; flex: 1; min-height: 0; }
	.amain { flex: 1; display: flex; flex-direction: column; min-width: 0; min-height: 0; }
	.histbtn { display: none; align-items: center; gap: 6px; font-size: 12.5px; color: var(--text-muted); background: var(--surface-1); border: 1px solid var(--border-soft); border-radius: 999px; padding: 6px 12px; transition: all 0.16s; }
	.histbtn:hover { color: var(--text); border-color: var(--ember-line); }
	@media (max-width: 760px) { .histbtn { display: inline-flex; } }

	.scroll { flex: 1; overflow-y: auto; padding: 24px 28px 40px; }

	/* Modus-Umschalter */
	.modes { display: flex; gap: 4px; max-width: 720px; margin: 0 auto 12px; background: var(--surface-2); border: 1px solid var(--border-soft); border-radius: 999px; padding: 4px; }
	.seg { flex: 1; padding: 8px 14px; border-radius: 999px; border: none; background: transparent; color: var(--text-muted); font-family: var(--font-body); font-size: 13.5px; cursor: pointer; transition: all 0.16s; }
	.seg.on { background: var(--surface-1); color: var(--text); box-shadow: var(--shadow-sm, 0 1px 2px rgba(0,0,0,0.15)); }

	.searchbar { display: flex; align-items: center; gap: 10px; padding: 8px 8px 8px 14px; background: var(--surface-1); border: 1px solid var(--border); border-radius: var(--radius); max-width: 720px; margin: 0 auto; }
	.searchbar:focus-within { border-color: var(--ember-line); }
	.searchbar .ico { color: var(--text-faint); flex: none; }
	.searchbar input { flex: 1; background: transparent; border: none; outline: none; color: var(--text); font-family: var(--font-body); font-size: 15px; padding: 6px 0; }
	.searchbar input::placeholder { color: var(--text-faint); }

	.btn { font-family: var(--font-body); font-size: 14px; padding: 9px 18px; border-radius: var(--radius-sm); border: 1px solid transparent; cursor: pointer; flex: none; }
	.btn.primary { background: var(--ember); color: var(--bg); font-weight: 600; }
	.btn.primary:hover:not(:disabled) { background: var(--ember-bright); }
	.btn.ghost { background: var(--surface-2); color: var(--text-muted); border-color: var(--border-soft); }
	.btn.ghost:hover { color: var(--text); border-color: var(--border); }
	.btn:disabled { opacity: 0.5; cursor: default; }

	/* Deep-Optionen */
	.opts { display: flex; align-items: center; gap: 14px; max-width: 720px; margin: 12px auto 0; flex-wrap: wrap; }
	.opt { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text-muted); }
	.opt select { background: var(--surface-1); border: 1px solid var(--border-soft); border-radius: var(--radius-sm); color: var(--text); font-family: var(--font-body); font-size: 13px; padding: 6px 10px; }
	.mtoggle { display: flex; gap: 2px; background: var(--surface-2); border: 1px solid var(--border-soft); border-radius: 999px; padding: 3px; }
	.mt { padding: 5px 12px; border-radius: 999px; border: none; background: transparent; color: var(--text-muted); font-family: var(--font-body); font-size: 12.5px; cursor: pointer; }
	.mt.on { background: var(--surface-1); color: var(--text); }
	.mt:disabled { opacity: 0.5; cursor: default; }

	.state-line { display: flex; align-items: center; gap: 10px; margin-top: 28px; color: var(--text-muted); font-size: 14px; }
	.spinner { width: 16px; height: 16px; border: 2px solid var(--border); border-top-color: var(--ember); border-radius: 50%; animation: spin 0.7s linear infinite; }
	.spinner.sm { width: 13px; height: 13px; border-width: 2px; }
	@keyframes spin { to { transform: rotate(360deg); } }

	.notice { margin-top: 24px; padding: 14px 16px; background: var(--surface-1); border: 1px solid var(--border-soft); border-radius: var(--radius-sm); color: var(--text-muted); font-size: 14px; max-width: 720px; }
	.meta { margin: 24px 0 12px; color: var(--text-faint); font-family: var(--font-mono); font-size: 12px; }

	.list { display: flex; flex-direction: column; gap: 12px; max-width: 820px; }
	.card { padding: 16px 18px; background: var(--surface-1); border: 1px solid var(--border-soft); border-radius: var(--radius-sm); }
	.card:hover { border-color: var(--border); }
	.title { display: inline-block; color: var(--text); font-size: 16px; font-weight: 600; text-decoration: none; line-height: 1.35; }
	.title:hover { color: var(--ember-bright); }
	.url { display: block; margin-top: 3px; color: var(--sage); font-family: var(--font-mono); font-size: 12px; }
	.snip { margin-top: 8px; color: var(--text-muted); font-size: 14px; line-height: 1.55; }

	/* Deep Research: Panels, Schritte, Report, Quellen */
	.panel { max-width: 820px; margin: 20px 0 0; padding: 16px 18px; background: var(--surface-1); border: 1px solid var(--border-soft); border-radius: var(--radius-sm); }
	.ptitle { margin: 0 0 12px; font-size: 11px; font-family: var(--font-mono); text-transform: uppercase; letter-spacing: 0.1em; color: var(--text-faint); font-weight: 600; }
	.steps { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
	.step { display: flex; align-items: center; gap: 10px; font-size: 14px; color: var(--text-muted); }
	.step.done { color: var(--text); }
	.marker { flex: none; width: 20px; height: 20px; display: grid; place-items: center; color: var(--text-faint); }
	.step.done .marker { color: var(--sage); }
	.slabel { font-weight: 500; }
	.sdetail { color: var(--text-faint); font-size: 12.5px; }
	.subq { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 12px; }
	.qchip { font-size: 12px; color: var(--text-muted); background: var(--surface-2); border: 1px solid var(--border-soft); border-radius: 999px; padding: 4px 10px; font-family: var(--font-mono); }

	.report { max-width: 820px; margin: 20px 0 0; padding: 24px 26px; background: var(--surface-1); border: 1px solid var(--border); border-radius: var(--radius); }
	.rbody { color: var(--text); font-size: 15px; line-height: 1.7; }
	.rbody :global(h1), .rbody :global(h2), .rbody :global(h3) { color: var(--text); line-height: 1.3; margin: 1.2em 0 0.5em; }
	.rbody :global(h2) { font-size: 18px; }
	.rbody :global(h3) { font-size: 16px; }
	.rbody :global(p) { margin: 0.7em 0; }
	.rbody :global(ul), .rbody :global(ol) { margin: 0.7em 0; padding-left: 1.4em; }
	.rbody :global(li) { margin: 0.3em 0; }
	.rbody :global(a) { color: var(--ember-bright); }
	.rbody :global(a.fn) { color: var(--sage); font-size: 0.8em; vertical-align: super; text-decoration: none; padding: 0 1px; font-family: var(--font-mono); }
	.rbody :global(a.fn:hover) { text-decoration: underline; }
	.rbody :global(code) { background: var(--surface-2); border-radius: 4px; padding: 1px 5px; font-family: var(--font-mono); font-size: 0.9em; }
	.rbody :global(blockquote) { border-left: 3px solid var(--border); margin: 0.7em 0; padding-left: 14px; color: var(--text-muted); }

	.sources .srclist { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
	.src { display: flex; align-items: flex-start; gap: 10px; scroll-margin-top: 16px; }
	.sn { flex: none; width: 22px; height: 22px; display: grid; place-items: center; background: var(--surface-2); border-radius: 6px; font-size: 12px; font-family: var(--font-mono); color: var(--text-muted); }
	.sinfo { flex: 1; min-width: 0; display: flex; flex-direction: column; }
	.stitle { color: var(--text); font-size: 14px; text-decoration: none; line-height: 1.35; }
	.stitle:hover { color: var(--ember-bright); }
	.surl { color: var(--sage); font-family: var(--font-mono); font-size: 11.5px; margin-top: 1px; }
	.badge { flex: none; font-size: 11px; color: var(--sage); background: color-mix(in srgb, var(--sage) 14%, transparent); border: 1px solid color-mix(in srgb, var(--sage) 30%, transparent); border-radius: 999px; padding: 2px 8px; white-space: nowrap; }

	.loaded-hint { display: flex; align-items: center; gap: 8px; max-width: 820px; margin: 20px 0 0; padding: 8px 14px; background: var(--surface-2); border: 1px solid var(--border-soft); border-radius: 999px; color: var(--text-muted); font-size: 12.5px; }
	.loaded-hint svg { color: var(--sage); flex: none; }

	.saved .savedlist { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
	.saveditem { display: flex; align-items: center; border-radius: 8px; transition: background 0.14s; }
	.saveditem:hover { background: var(--surface-2); }
	.openrep { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; text-align: left; background: none; border: none; padding: 9px 10px; cursor: pointer; }
	.sq { color: var(--text); font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.saveditem:hover .sq { color: var(--ember-bright); }
	.smeta { color: var(--text-faint); font-family: var(--font-mono); font-size: 11px; }
	.del { flex: none; width: 30px; height: 30px; display: grid; place-items: center; border-radius: 6px; color: var(--text-faint); background: none; border: none; margin-right: 4px; opacity: 0; transition: all 0.14s; }
	.saveditem:hover .del { opacity: 1; }
	.del:hover { color: var(--text); background: var(--surface-3); }

	.empty { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 8px; margin-top: 64px; color: var(--text-muted); }
	.big-ico { color: var(--text-faint); margin-bottom: 6px; }
	.empty-lead { font-size: 15px; color: var(--text); max-width: 460px; }
	.empty-sub { font-size: 13px; color: var(--text-faint); margin-top: 8px; max-width: 460px; }
	.chips { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; margin-top: 6px; max-width: 560px; }
	.chip { padding: 7px 14px; background: var(--surface-2); border: 1px solid var(--border-soft); border-radius: 999px; color: var(--text-muted); font-family: var(--font-body); font-size: 13px; cursor: pointer; }
	.chip:hover { border-color: var(--ember-line); color: var(--text); }
</style>
