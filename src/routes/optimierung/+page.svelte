<script lang="ts">
	import { onMount } from 'svelte';
	import AppHeader from '$lib/components/AppHeader.svelte';
	import { i18n } from '$lib/stores/i18n.svelte';
	import { renderMarkdown } from '$lib/markdown';
	import { dictation } from '$lib/actions/dictation';

	// ---------- Types ----------
	type Status = 'geplant' | 'laufend' | 'ausgewertet';
	type Experiment = {
		id: string;
		title: string;
		hypothesis: string;
		metricId?: string;
		metricName?: string;
		baseline?: number;
		status: Status;
		result?: string;
		learning?: string;
		createdAt: string;
	};
	type Metric = { id: string; name: string; unit?: string; current: number; history: { at: string; value: number }[] };

	const STATUS_ORDER: Status[] = ['laufend', 'geplant', 'ausgewertet'];

	// ---------- State ----------
	let experiments = $state<Experiment[]>([]);
	let metrics = $state<Metric[]>([]);
	let loading = $state(true);
	let busy = $state<string | null>(null); // experiment id currently evaluating
	let rowBusy = $state<string | null>(null); // experiment id of a status/remove change
	let errors = $state<Record<string, string>>({});

	// ---------- Loaders ----------
	function applyExperiments(list: any) {
		experiments = Array.isArray(list) ? list : [];
	}
	async function load() {
		try {
			const [oRes, mRes] = await Promise.all([fetch('/api/optimization'), fetch('/api/metrics')]);
			const oData = await oRes.json();
			const mData = await mRes.json();
			applyExperiments(oData?.experiments ?? []);
			metrics = Array.isArray(mData?.metrics) ? mData.metrics : [];
		} catch {
			applyExperiments([]);
			metrics = [];
		}
	}
	async function post(payload: Record<string, unknown>): Promise<any> {
		const res = await fetch('/api/optimization', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(payload)
		});
		return res.json();
	}

	onMount(async () => {
		await load();
		loading = false;
	});

	// ---------- Helpers ----------
	function metricOf(e: Experiment): Metric | undefined {
		return e.metricId ? metrics.find((m) => m.id === e.metricId) : undefined;
	}
	function currentValue(m?: Metric): number | undefined {
		if (!m) return undefined;
		if (Number.isFinite(m.current)) return m.current;
		const h = m.history;
		if (Array.isArray(h) && h.length) return h[h.length - 1]?.value;
		return undefined;
	}
	function fmtNum(value?: number, unit?: string): string {
		if (value == null || !Number.isFinite(value)) return '—';
		const n = value.toLocaleString(i18n.lang === 'en' ? 'en-GB' : 'de-DE', { maximumFractionDigits: 2 });
		if (!unit) return n;
		return unit === '%' ? `${n} %` : `${n} ${unit}`;
	}
	function deltaInfo(e: Experiment): { dir: 'up' | 'down' | 'flat'; text: string } | null {
		const m = metricOf(e);
		const cur = currentValue(m);
		if (e.baseline == null || cur == null) return null;
		const d = cur - e.baseline;
		const dir = d > 0 ? 'up' : d < 0 ? 'down' : 'flat';
		const sign = d > 0 ? '+' : '';
		const text = `${sign}${d.toLocaleString(i18n.lang === 'en' ? 'en-GB' : 'de-DE', { maximumFractionDigits: 2 })}${m?.unit ? ' ' + m.unit : ''}`;
		return { dir, text };
	}
	function statusLabel(s: Status): string {
		return i18n.t('optimierung.status_' + s);
	}
	function byStatus(s: Status): Experiment[] {
		return experiments.filter((e) => e.status === s);
	}

	// ---------- Editor (create experiment) ----------
	let editor = $state<{ open: boolean; title: string; hypothesis: string; metricId: string; busy: boolean }>(
		{ open: false, title: '', hypothesis: '', metricId: '', busy: false }
	);
	function openCreate() {
		editor = { open: true, title: '', hypothesis: '', metricId: '', busy: false };
	}
	function closeEditor() { editor = { ...editor, open: false }; }

	async function createExperiment() {
		if (editor.busy || !editor.title.trim()) return;
		editor.busy = true;
		try {
			const data = await post({
				action: 'add-experiment',
				title: editor.title.trim(),
				hypothesis: editor.hypothesis.trim(),
				metricId: editor.metricId || undefined
			});
			if (data?.ok) {
				applyExperiments(data.experiments);
				closeEditor();
			}
		} catch {
			/* leave editor open on failure */
		} finally {
			editor.busy = false;
		}
	}

	// ---------- Status / Remove ----------
	async function setStatus(e: Experiment, status: Status) {
		if (rowBusy || busy) return;
		rowBusy = e.id;
		try {
			const data = await post({ action: 'update-experiment', id: e.id, status });
			if (data?.experiments) applyExperiments(data.experiments);
		} finally {
			rowBusy = null;
		}
	}
	async function removeExperiment(e: Experiment) {
		if (rowBusy || busy) return;
		if (!confirm(i18n.t('optimierung.removeConfirm'))) return;
		rowBusy = e.id;
		try {
			const data = await post({ action: 'remove-experiment', id: e.id });
			if (data?.experiments) applyExperiments(data.experiments);
		} finally {
			rowBusy = null;
		}
	}

	// ---------- Evaluate (AI) ----------
	async function evaluate(e: Experiment) {
		if (busy || rowBusy) return; // double-click guard
		busy = e.id;
		errors[e.id] = '';
		try {
			const data = await post({ action: 'evaluate', id: e.id });
			if (data?.ok) {
				applyExperiments(data.experiments);
			} else {
				errors[e.id] = (data?.message ?? '').toString() || i18n.t('optimierung.failed');
			}
		} catch {
			errors[e.id] = i18n.t('optimierung.networkError');
		} finally {
			busy = null;
		}
	}
</script>

<AppHeader title={i18n.t('optimierung.title')} eyebrow={i18n.t('optimierung.eyebrow')} />

<div class="scroll">
	<div class="section-head">
		<p class="lead">{i18n.t('optimierung.lead')}</p>
		{#if experiments.length > 0}
			<button class="btn primary" onclick={openCreate}>
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14" /></svg>
				{i18n.t('optimierung.newExperiment')}
			</button>
		{/if}
	</div>

	{#if loading}
		<p class="muted">{i18n.t('optimierung.loading')}</p>

	{:else if experiments.length === 0}
		<div class="empty">
			<span class="big">🧪</span>
			<h3>{i18n.t('optimierung.noExperiments')}</h3>
			<p>{i18n.t('optimierung.noExperimentsHint')}</p>
			<button class="btn primary" onclick={openCreate}>{i18n.t('optimierung.createFirst')}</button>
		</div>

	{:else}
		{#each STATUS_ORDER as s (s)}
			{@const group = byStatus(s)}
			{#if group.length}
				<section class="group">
					<h2 class="group-head">
						<span class="dot dot-{s}"></span>
						{statusLabel(s)}
						<span class="count">{group.length}</span>
					</h2>
					<div class="grid">
						{#each group as e (e.id)}
							{@const m = metricOf(e)}
							{@const cur = currentValue(m)}
							{@const d = deltaInfo(e)}
							<article class="card">
								<div class="card-top">
									<strong class="card-title">{e.title}</strong>
									<span class="badge badge-{e.status}">{statusLabel(e.status)}</span>
								</div>

								{#if e.hypothesis}
									<p class="hypo"><span class="hypo-label">{i18n.t('optimierung.hypothesis')}:</span> {e.hypothesis}</p>
								{/if}

								{#if e.metricName}
									<div class="metric-row">
										<span class="metric-name">{e.metricName}</span>
										<span class="metric-flow">
											{fmtNum(e.baseline, m?.unit)}
											<span class="arrow">→</span>
											{fmtNum(cur, m?.unit)}
										</span>
										{#if d}
											<span class="delta delta-{d.dir}">{d.dir === 'up' ? '↑' : d.dir === 'down' ? '↓' : '→'} {d.text}</span>
										{/if}
									</div>
								{:else}
									<p class="no-metric">{i18n.t('optimierung.noMetricLinked')}</p>
								{/if}

								{#if errors[e.id]}
									<div class="notice">{errors[e.id]}</div>
								{/if}

								{#if busy === e.id}
									<div class="result-box pending">
										<span class="spinner"></span>
										<span>{i18n.t('optimierung.evaluating')}</span>
									</div>
								{:else if e.result}
									<div class="result-box">
										<span class="result-title">{i18n.t('optimierung.evaluation')}</span>
										<div class="md result-md">{@html renderMarkdown(e.result)}</div>
									</div>
									{#if e.learning}
										<div class="learning">
											<span class="learning-label">{i18n.t('optimierung.learning')}</span>
											<div class="md learning-md">{@html renderMarkdown(e.learning)}</div>
										</div>
									{/if}
								{/if}

								<div class="card-actions">
									<button class="mini-btn accent" onclick={() => evaluate(e)} disabled={busy === e.id || rowBusy === e.id}>
										{e.result ? i18n.t('optimierung.reEvaluate') : i18n.t('optimierung.evaluate')}
									</button>
									{#if e.status === 'geplant'}
										<button class="mini-btn" onclick={() => setStatus(e, 'laufend')} disabled={rowBusy === e.id || busy === e.id}>{i18n.t('optimierung.markRunning')}</button>
									{:else if e.status === 'laufend'}
										<button class="mini-btn" onclick={() => setStatus(e, 'geplant')} disabled={rowBusy === e.id || busy === e.id}>{i18n.t('optimierung.markPlanned')}</button>
									{/if}
									<button class="mini-btn danger" onclick={() => removeExperiment(e)} disabled={rowBusy === e.id || busy === e.id}>{i18n.t('optimierung.delete')}</button>
								</div>
							</article>
						{/each}
					</div>
				</section>
			{/if}
		{/each}
	{/if}
</div>

<!-- =================== EXPERIMENT EDITOR =================== -->
{#if editor.open}
	<div class="overlay" role="button" tabindex="0" onclick={closeEditor} onkeydown={(ev) => ev.key === 'Escape' && closeEditor()}>
		<div class="dialog" role="dialog" aria-modal="true" aria-label={i18n.t('optimierung.editorNew')} tabindex="-1" onclick={(ev) => ev.stopPropagation()} onkeydown={() => {}}>
			<div class="dhead">
				<span class="emoji big">🧪</span>
				<div>
					<h3>{i18n.t('optimierung.editorNew')}</h3>
					<span class="eyebrow">{i18n.t('optimierung.title')}</span>
				</div>
			</div>
			<div class="fields">
				<label>
					<span>{i18n.t('optimierung.expTitle')}</span>
					<input type="text" placeholder={i18n.t('optimierung.expTitlePlaceholder')} bind:value={editor.title} autocomplete="off" />
				</label>
				<label>
					<span>{i18n.t('optimierung.hypothesis')}</span>
					<textarea rows="3" placeholder={i18n.t('optimierung.hypothesisPlaceholder')} bind:value={editor.hypothesis} use:dictation={{ getText: () => editor.hypothesis, append: (s) => editor.hypothesis = (editor.hypothesis ? editor.hypothesis + ' ' : '') + s }}></textarea>
				</label>
				<label>
					<span>{i18n.t('optimierung.linkMetric')}</span>
					{#if metrics.length}
						<select bind:value={editor.metricId}>
							<option value="">{i18n.t('optimierung.noMetric')}</option>
							{#each metrics as m (m.id)}
								<option value={m.id}>{m.name}{m.unit ? ' (' + m.unit + ')' : ''} · {fmtNum(currentValue(m), m.unit)}</option>
							{/each}
						</select>
						{#if editor.metricId}
							{@const sel = metrics.find((m) => m.id === editor.metricId)}
							{#if sel}<p class="hint-note">{i18n.t('optimierung.baselineHint')} {fmtNum(currentValue(sel), sel.unit)}</p>{/if}
						{/if}
					{:else}
						<p class="hint-note">{i18n.t('optimierung.noMetricsAvailable')}</p>
					{/if}
				</label>
			</div>
			<div class="dactions">
				<button class="btn ghost" onclick={closeEditor}>{i18n.t('optimierung.cancel')}</button>
				<button class="btn primary" onclick={createExperiment} disabled={editor.busy || !editor.title.trim()}>
					{editor.busy ? i18n.t('optimierung.saving') : i18n.t('optimierung.create')}
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.scroll { flex: 1; overflow-y: auto; padding: 24px 28px 48px; }
	.muted { color: var(--text-faint); }

	.section-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; margin-bottom: 22px; }
	.lead { color: var(--text-muted); max-width: 560px; margin: 0; }

	/* Buttons */
	.btn { display: inline-flex; align-items: center; gap: 7px; border-radius: 9px; padding: 8px 14px; font-size: 13px; font-weight: 500; border: 1px solid transparent; transition: all 0.16s; white-space: nowrap; }
	.btn svg { width: 15px; height: 15px; }
	.btn:disabled { opacity: 0.45; cursor: not-allowed; }
	.btn.primary { background: var(--ember); color: #1a1206; }
	.btn.primary:not(:disabled):hover { background: var(--ember-bright); }
	.btn.ghost { background: transparent; border-color: var(--border); color: var(--text-muted); }
	.btn.ghost:not(:disabled):hover { color: var(--text); border-color: var(--text-faint); }

	.mini-btn { font-size: 12px; color: var(--text-muted); background: var(--surface-2); border: 1px solid var(--border-soft); border-radius: 7px; padding: 5px 10px; transition: all 0.14s; }
	.mini-btn:hover { color: var(--text); border-color: var(--border); }
	.mini-btn.accent { color: var(--ember-bright); border-color: var(--ember-line); }
	.mini-btn.accent:hover { background: var(--ember-soft); }
	.mini-btn.danger:hover { color: var(--danger); border-color: var(--danger-soft); background: var(--danger-soft); }
	.mini-btn:disabled { opacity: 0.45; cursor: not-allowed; }

	/* Status groups */
	.group { margin-bottom: 28px; }
	.group-head { display: flex; align-items: center; gap: 9px; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-muted); margin: 0 0 12px; }
	.group-head .count { font-size: 11px; font-family: var(--font-mono); color: var(--text-faint); background: var(--surface-2); border: 1px solid var(--border-soft); border-radius: 999px; padding: 1px 8px; }
	.dot { width: 8px; height: 8px; border-radius: 50%; flex: none; }
	.dot-geplant { background: var(--text-faint); }
	.dot-laufend { background: var(--ember); }
	.dot-ausgewertet { background: var(--sage); }

	/* Cards */
	.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 12px; }
	.card { background: var(--surface-1); border: 1px solid var(--border-soft); border-radius: var(--radius); padding: 16px; display: flex; flex-direction: column; gap: 10px; transition: border-color 0.18s, transform 0.18s var(--ease); }
	.card:hover { border-color: var(--border); }
	.card-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
	.card-title { font-size: 15px; font-weight: 600; word-break: break-word; }
	.badge { flex: none; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.06em; padding: 2px 8px; border-radius: 999px; border: 1px solid var(--border-soft); color: var(--text-muted); background: var(--surface-2); white-space: nowrap; }
	.badge-laufend { color: var(--ember-bright); border-color: var(--ember-line); background: var(--ember-soft); }
	.badge-ausgewertet { color: var(--sage); border-color: var(--border-soft); }

	.hypo { margin: 0; font-size: 13px; line-height: 1.5; color: var(--text-muted); }
	.hypo-label { color: var(--text-faint); font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; font-family: var(--font-mono); }

	/* Metric flow */
	.metric-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 9px 11px; background: var(--surface-2); border: 1px solid var(--border-soft); border-radius: 9px; }
	.metric-name { font-size: 12.5px; font-weight: 500; color: var(--text); }
	.metric-flow { font-family: var(--font-mono); font-size: 13px; color: var(--ember-bright); display: inline-flex; align-items: center; gap: 6px; }
	.metric-flow .arrow { color: var(--text-faint); }
	.delta { font-family: var(--font-mono); font-size: 12px; font-weight: 600; margin-left: auto; }
	.delta-up { color: var(--sage); }
	.delta-down { color: var(--danger); }
	.delta-flat { color: var(--text-muted); }
	.no-metric { margin: 0; font-size: 12px; color: var(--text-faint); font-style: italic; }

	/* Notice (error / skip-on-fail) */
	.notice { background: var(--ember-soft); border: 1px solid var(--ember-line); border-radius: var(--radius-sm); padding: 10px 13px; font-size: 12.5px; color: var(--ember-bright); line-height: 1.5; }

	/* Result + learning */
	.result-box { background: var(--surface-2); border: 1px solid var(--border-soft); border-radius: var(--radius-sm); padding: 12px 14px; }
	.result-box.pending { display: flex; align-items: center; gap: 10px; color: var(--text-muted); font-size: 13px; }
	.result-title { display: block; font-size: 11px; text-transform: uppercase; letter-spacing: 0.09em; font-family: var(--font-mono); color: var(--text-faint); margin-bottom: 8px; }
	.learning { background: var(--ember-soft); border: 1px solid var(--ember-line); border-radius: var(--radius-sm); padding: 10px 13px; }
	.learning-label { display: block; font-size: 11px; text-transform: uppercase; letter-spacing: 0.09em; font-family: var(--font-mono); color: var(--ember-bright); margin-bottom: 5px; }

	.spinner { width: 15px; height: 15px; border: 2px solid var(--border); border-top-color: var(--ember); border-radius: 50%; animation: spin 0.7s linear infinite; }
	@keyframes spin { to { transform: rotate(360deg); } }

	.card-actions { display: flex; gap: 7px; margin-top: auto; padding-top: 6px; flex-wrap: wrap; }

	/* Empty state */
	.empty { text-align: center; padding: 48px 20px; background: var(--surface-1); border: 1px dashed var(--border); border-radius: var(--radius-lg); display: flex; flex-direction: column; align-items: center; gap: 8px; }
	.empty .big { font-size: 36px; }
	.empty h3 { font-size: 16px; }
	.empty p { margin: 0; color: var(--text-muted); font-size: 13.5px; max-width: 440px; }
	.empty .btn { margin-top: 10px; }

	/* Inputs */
	input[type='text'], textarea, select {
		width: 100%; background: var(--bg); border: 1px solid var(--border); border-radius: 9px; color: var(--text);
		padding: 10px 12px; font-family: var(--font-body); font-size: 13.5px;
	}
	textarea { resize: vertical; line-height: 1.5; }
	select { cursor: pointer; }
	input:focus, textarea:focus, select:focus { outline: none; border-color: var(--ember-line); }
	.hint-note { margin: 6px 0 0; font-size: 12px; color: var(--text-faint); line-height: 1.45; }

	/* Dialog */
	.overlay { position: fixed; inset: 0; background: rgba(8, 6, 4, 0.66); backdrop-filter: blur(3px); display: grid; place-items: center; padding: 20px; z-index: 100; }
	.dialog { width: 100%; max-width: 480px; max-height: 88vh; overflow-y: auto; background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 22px; box-shadow: var(--shadow); }
	.dhead { display: flex; align-items: center; gap: 12px; margin-bottom: 18px; }
	.dhead h3 { font-size: 16px; }
	.emoji.big { font-size: 30px; line-height: 1; }
	.eyebrow { font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--text-faint); }
	.fields { display: flex; flex-direction: column; gap: 12px; }
	.fields label span { display: block; font-size: 12.5px; color: var(--text-muted); margin-bottom: 5px; }
	.dactions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px; }

	/* Markdown */
	.result-md, .learning-md { font-size: 13px; line-height: 1.6; color: var(--text); }
	.learning-md { color: var(--text); }
	.md :global(p) { margin: 0 0 8px; }
	.md :global(p:last-child) { margin-bottom: 0; }
	.md :global(ul), .md :global(ol) { margin: 0 0 8px; padding-left: 20px; }
	.md :global(li) { margin: 2px 0; }
	.md :global(h1), .md :global(h2), .md :global(h3), .md :global(h4) { font-size: 14px; margin: 10px 0 5px; }
	.md :global(strong) { color: var(--text); }
	.md :global(a) { color: var(--ember-bright); }

	/* Mobile */
	@media (max-width: 640px) {
		.scroll { padding: 20px 16px 40px; }
		.section-head { flex-direction: column; }
		.grid { grid-template-columns: 1fr; }
		.metric-row { gap: 7px; }
		.delta { margin-left: 0; }
	}
</style>
