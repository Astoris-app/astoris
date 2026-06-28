<script lang="ts">
	import { onMount } from 'svelte';
	import AppHeader from '$lib/components/AppHeader.svelte';
	import { i18n } from '$lib/stores/i18n.svelte';
	import { dictation } from '$lib/actions/dictation';

	// ---------- Types ----------
	type Measurement = { at: string; value: number };
	type Metric = {
		id: string;
		name: string;
		unit?: string;
		category?: string;
		target?: number;
		current: number;
		history: Measurement[];
		createdAt: string;
	};

	// Example KPI suggestions for the empty state (label key + sensible unit).
	const EXAMPLES = [
		{ key: 'exRevenue', unit: '€' },
		{ key: 'exLeads', unit: '' },
		{ key: 'exConversion', unit: '%' },
		{ key: 'exReach', unit: '' }
	];

	// ---------- State ----------
	let metrics = $state<Metric[]>([]);
	let loading = $state(true);

	// ---------- Loaders ----------
	function apply(list: any) {
		metrics = Array.isArray(list) ? list : [];
	}
	async function load() {
		try {
			const res = await fetch('/api/metrics');
			const data = await res.json();
			apply(data?.metrics ?? []);
		} catch {
			apply([]);
		}
	}
	async function post(payload: Record<string, unknown>): Promise<boolean> {
		try {
			const res = await fetch('/api/metrics', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(payload)
			});
			if (!res.ok) return false;
			const data = await res.json();
			if (data?.metrics) apply(data.metrics);
			return true;
		} catch {
			return false;
		}
	}

	onMount(async () => {
		await load();
		loading = false;
	});

	// ---------- Helpers ----------
	function fmtNum(value?: number, unit?: string): string {
		if (value == null || !Number.isFinite(value)) return '—';
		const n = value.toLocaleString(i18n.lang === 'en' ? 'en-GB' : 'de-DE', { maximumFractionDigits: 2 });
		if (!unit) return n;
		// Percent / currency-style units read better glued or spaced depending on symbol.
		return unit === '%' ? `${n} %` : `${n} ${unit}`;
	}

	// Trend from the last two history points: 'up' | 'down' | 'flat' | null (not enough data).
	function trendOf(m: Metric): { dir: 'up' | 'down' | 'flat'; delta: number } | null {
		const h = m.history;
		if (!h || h.length < 2) return null;
		const a = h[h.length - 2].value;
		const b = h[h.length - 1].value;
		const delta = b - a;
		if (delta > 0) return { dir: 'up', delta };
		if (delta < 0) return { dir: 'down', delta };
		return { dir: 'flat', delta: 0 };
	}

	function trendPct(m: Metric): string {
		const t = trendOf(m);
		if (!t) return '';
		const h = m.history;
		const prev = h[h.length - 2].value;
		if (!Number.isFinite(prev) || prev === 0) return t.delta > 0 ? '+' : t.delta < 0 ? '−' : '';
		const pct = (t.delta / Math.abs(prev)) * 100;
		const sign = pct > 0 ? '+' : '';
		return `${sign}${pct.toLocaleString(i18n.lang === 'en' ? 'en-GB' : 'de-DE', { maximumFractionDigits: 1 })} %`;
	}

	// Progress towards target (0..1), only when a positive target exists.
	function progress(m: Metric): number | null {
		if (m.target == null || !Number.isFinite(m.target) || m.target <= 0) return null;
		return Math.max(0, Math.min(1, m.current / m.target));
	}

	// Builds an SVG polyline points string from history values, scaled into a w×h box.
	function sparkPoints(history: Measurement[], w: number, h: number): string {
		const vals = history.map((p) => p.value).filter((v) => Number.isFinite(v));
		if (vals.length < 2) return '';
		const min = Math.min(...vals);
		const max = Math.max(...vals);
		const span = max - min || 1;
		const pad = 2;
		const innerW = w - pad * 2;
		const innerH = h - pad * 2;
		const step = innerW / (vals.length - 1);
		return vals
			.map((v, i) => {
				const x = pad + i * step;
				// Invert Y (SVG origin is top-left); higher value → higher on screen.
				const y = pad + innerH - ((v - min) / span) * innerH;
				return `${x.toFixed(1)},${y.toFixed(1)}`;
			})
			.join(' ');
	}

	// ---------- Editor (create / edit metric) ----------
	let editor = $state<{
		open: boolean; id: string | null; name: string; unit: string; category: string;
		target: string; current: string; busy: boolean;
	}>({ open: false, id: null, name: '', unit: '', category: '', target: '', current: '', busy: false });
	let rowBusy = $state<string | null>(null);

	function openCreate(name = '', unit = '') {
		editor = { open: true, id: null, name, unit, category: '', target: '', current: '', busy: false };
	}
	function openEdit(m: Metric) {
		editor = {
			open: true, id: m.id, name: m.name ?? '', unit: m.unit ?? '', category: m.category ?? '',
			target: m.target != null ? String(m.target) : '',
			current: m.current != null ? String(m.current) : '',
			busy: false
		};
	}
	function closeEditor() { editor = { ...editor, open: false }; }

	async function saveMetric() {
		if (editor.busy || !editor.name.trim()) return;
		editor.busy = true;
		const target = editor.target.trim();
		const current = editor.current.trim();
		const payload: Record<string, unknown> = {
			name: editor.name.trim(),
			unit: editor.unit.trim(),
			category: editor.category.trim(),
			target: target === '' ? '' : Number(target)
		};
		try {
			let ok: boolean;
			if (editor.id) {
				ok = await post({ action: 'update-metric', id: editor.id, ...payload, current: current === '' ? '' : Number(current) });
			} else {
				// On create, the entered current value seeds the first history point.
				ok = await post({ action: 'add-metric', ...payload, current: current === '' ? '' : Number(current) });
			}
			if (ok) closeEditor();
		} finally {
			editor.busy = false;
		}
	}

	async function removeMetric(id: string) {
		if (rowBusy) return;
		if (!confirm(i18n.t('metrics.removeConfirm'))) return;
		rowBusy = id;
		try { await post({ action: 'remove-metric', id }); } finally { rowBusy = null; }
	}

	// ---------- Measurement (quick entry) ----------
	let measure = $state<{ open: boolean; id: string | null; name: string; unit: string; value: string; busy: boolean }>(
		{ open: false, id: null, name: '', unit: '', value: '', busy: false }
	);

	function openMeasure(m: Metric) {
		measure = { open: true, id: m.id, name: m.name, unit: m.unit ?? '', value: '', busy: false };
	}
	function closeMeasure() { measure = { ...measure, open: false }; }
	async function saveMeasurement() {
		if (measure.busy || !measure.id) return;
		const v = measure.value.trim();
		if (v === '' || !Number.isFinite(Number(v))) return;
		measure.busy = true;
		try {
			const ok = await post({ action: 'add-measurement', id: measure.id, value: Number(v) });
			if (ok) closeMeasure();
		} finally {
			measure.busy = false;
		}
	}
</script>

<AppHeader title={i18n.t('metrics.title')} eyebrow={i18n.t('metrics.eyebrow')} />

<div class="scroll">
	<div class="section-head">
		<p class="lead">{i18n.t('metrics.lead')}</p>
		{#if metrics.length > 0}
			<button class="btn primary" onclick={() => openCreate()}>
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14" /></svg>
				{i18n.t('metrics.newMetric')}
			</button>
		{/if}
	</div>

	{#if loading}
		<p class="muted">{i18n.t('metrics.loading')}</p>

	{:else if metrics.length === 0}
		<div class="empty">
			<span class="big">📈</span>
			<h3>{i18n.t('metrics.noMetrics')}</h3>
			<p>{i18n.t('metrics.noMetricsHint')}</p>
			<button class="btn primary" onclick={() => openCreate()}>{i18n.t('metrics.createFirst')}</button>
			<div class="examples">
				<span class="ex-label">{i18n.t('metrics.examplesLabel')}</span>
				<div class="ex-chips">
					{#each EXAMPLES as ex (ex.key)}
						<button class="chip" onclick={() => openCreate(i18n.t('metrics.' + ex.key), ex.unit)}>
							+ {i18n.t('metrics.' + ex.key)}
						</button>
					{/each}
				</div>
			</div>
		</div>

	{:else}
		<div class="grid">
			{#each metrics as m (m.id)}
				{@const t = trendOf(m)}
				{@const pr = progress(m)}
				{@const pts = sparkPoints(m.history, 200, 44)}
				<article class="card">
					<div class="card-top">
						<div class="title-wrap">
							<strong class="card-title">{m.name}</strong>
							{#if m.category}<span class="cat-badge">{m.category}</span>{/if}
						</div>
						{#if t}
							<span class="trend trend-{t.dir}" title={i18n.t('metrics.trend')}>
								{#if t.dir === 'up'}↑{:else if t.dir === 'down'}↓{:else}→{/if}
								{trendPct(m)}
							</span>
						{:else}
							<span class="trend trend-none" title={i18n.t('metrics.trendNone')}>·</span>
						{/if}
					</div>

					<div class="value-row">
						<span class="value">{fmtNum(m.current, m.unit)}</span>
						{#if m.target != null}
							<span class="target">{i18n.t('metrics.targetShort')} {fmtNum(m.target, m.unit)}</span>
						{/if}
					</div>

					{#if pr != null}
						<div class="bar" role="progressbar" aria-valuenow={Math.round(pr * 100)} aria-valuemin="0" aria-valuemax="100">
							<div class="bar-fill" class:done={pr >= 1} style="width: {(pr * 100).toFixed(1)}%"></div>
						</div>
						<span class="bar-pct">{Math.round(pr * 100)}%</span>
					{/if}

					{#if pts}
						<svg class="spark" viewBox="0 0 200 44" preserveAspectRatio="none" aria-hidden="true">
							<polyline
								class="spark-line trend-{t?.dir ?? 'flat'}"
								points={pts}
								fill="none"
								vector-effect="non-scaling-stroke"
							/>
						</svg>
					{:else}
						<p class="spark-empty">{i18n.t('metrics.needMore')}</p>
					{/if}

					<div class="card-meta">
						<span class="meta-pts">{m.history.length} {i18n.t('metrics.points')}</span>
					</div>

					<div class="card-actions">
						<button class="mini-btn accent" onclick={() => openMeasure(m)} disabled={rowBusy === m.id}>{i18n.t('metrics.addMeasurement')}</button>
						<button class="mini-btn" onclick={() => openEdit(m)} disabled={rowBusy === m.id}>{i18n.t('metrics.edit')}</button>
						<button class="mini-btn danger" onclick={() => removeMetric(m.id)} disabled={rowBusy === m.id}>{i18n.t('metrics.delete')}</button>
					</div>
				</article>
			{/each}
		</div>
	{/if}
</div>

<!-- =================== METRIC EDITOR =================== -->
{#if editor.open}
	<div class="overlay" role="button" tabindex="0" onclick={closeEditor} onkeydown={(e) => e.key === 'Escape' && closeEditor()}>
		<div class="dialog" role="dialog" aria-modal="true" aria-label={i18n.t('metrics.editorEdit')} tabindex="-1" onclick={(e) => e.stopPropagation()} onkeydown={() => {}}>
			<div class="dhead">
				<span class="emoji big">📊</span>
				<div>
					<h3>{editor.id ? i18n.t('metrics.editorEdit') : i18n.t('metrics.editorNew')}</h3>
					<span class="eyebrow">{i18n.t('metrics.title')}</span>
				</div>
			</div>
			<div class="fields">
				<label>
					<span>{i18n.t('metrics.name')}</span>
					<input type="text" placeholder={i18n.t('metrics.namePlaceholder')} bind:value={editor.name} autocomplete="off" use:dictation={{ getText: () => editor.name, append: (s) => editor.name = (editor.name ? editor.name + ' ' : '') + s }} />
				</label>
				<div class="two">
					<label class="grow">
						<span>{i18n.t('metrics.unit')}</span>
						<input type="text" placeholder={i18n.t('metrics.unitPlaceholder')} bind:value={editor.unit} autocomplete="off" />
					</label>
					<label class="grow">
						<span>{i18n.t('metrics.category')}</span>
						<input type="text" placeholder={i18n.t('metrics.categoryPlaceholder')} bind:value={editor.category} autocomplete="off" />
					</label>
				</div>
				<div class="two">
					<label class="grow">
						<span>{i18n.t('metrics.target')}</span>
						<input type="number" inputmode="decimal" placeholder={i18n.t('metrics.targetPlaceholder')} bind:value={editor.target} />
					</label>
					<label class="grow">
						<span>{editor.id ? i18n.t('metrics.current') : i18n.t('metrics.startValue')}</span>
						<input type="number" inputmode="decimal" placeholder={i18n.t('metrics.startValuePlaceholder')} bind:value={editor.current} />
					</label>
				</div>
				{#if !editor.id}<p class="hint-note">{i18n.t('metrics.startHint')}</p>{/if}
			</div>
			<div class="dactions">
				<button class="btn ghost" onclick={closeEditor}>{i18n.t('metrics.cancel')}</button>
				<button class="btn primary" onclick={saveMetric} disabled={editor.busy || !editor.name.trim()}>
					{editor.busy ? i18n.t('metrics.saving') : (editor.id ? i18n.t('metrics.save') : i18n.t('metrics.create'))}
				</button>
			</div>
		</div>
	</div>
{/if}

<!-- =================== MEASUREMENT ENTRY =================== -->
{#if measure.open}
	<div class="overlay" role="button" tabindex="0" onclick={closeMeasure} onkeydown={(e) => e.key === 'Escape' && closeMeasure()}>
		<div class="dialog small" role="dialog" aria-modal="true" aria-label={i18n.t('metrics.measureTitle')} tabindex="-1" onclick={(e) => e.stopPropagation()} onkeydown={() => {}}>
			<div class="dhead">
				<span class="emoji big">✏️</span>
				<div>
					<h3>{i18n.t('metrics.measureTitle')}</h3>
					<span class="eyebrow">{measure.name}</span>
				</div>
			</div>
			<div class="fields">
				<label>
					<span>{i18n.t('metrics.newValue')}{measure.unit ? ' (' + measure.unit + ')' : ''}</span>
					<!-- svelte-ignore a11y_autofocus -->
					<input
						type="number"
						inputmode="decimal"
						bind:value={measure.value}
						autofocus
						onkeydown={(e) => e.key === 'Enter' && saveMeasurement()}
					/>
				</label>
			</div>
			<div class="dactions">
				<button class="btn ghost" onclick={closeMeasure}>{i18n.t('metrics.cancel')}</button>
				<button class="btn primary" onclick={saveMeasurement} disabled={measure.busy || measure.value.trim() === '' || !Number.isFinite(Number(measure.value))}>
					{measure.busy ? i18n.t('metrics.saving') : i18n.t('metrics.record')}
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

	/* KPI grid */
	.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; }
	.card { background: var(--surface-1); border: 1px solid var(--border-soft); border-radius: var(--radius); padding: 16px; display: flex; flex-direction: column; gap: 9px; transition: border-color 0.18s, transform 0.18s var(--ease); }
	.card:hover { transform: translateY(-2px); border-color: var(--border); }
	.card-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
	.title-wrap { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
	.card-title { font-size: 15px; font-weight: 600; word-break: break-word; }
	.cat-badge { align-self: flex-start; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.07em; padding: 2px 8px; border-radius: 999px; border: 1px solid var(--border-soft); color: var(--text-muted); background: var(--surface-2); }

	/* Trend */
	.trend { flex: none; font-size: 12.5px; font-weight: 600; font-family: var(--font-mono); display: inline-flex; align-items: center; gap: 3px; white-space: nowrap; }
	.trend-up { color: var(--sage); }
	.trend-down { color: var(--danger); }
	.trend-flat { color: var(--text-muted); }
	.trend-none { color: var(--text-faint); }

	/* Value */
	.value-row { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
	.value { font-size: 26px; font-weight: 700; color: var(--ember-bright); line-height: 1.1; letter-spacing: -0.01em; }
	.target { font-size: 12px; color: var(--text-faint); font-family: var(--font-mono); }

	/* Progress bar */
	.bar { width: 100%; height: 6px; background: var(--surface-3); border-radius: 999px; overflow: hidden; }
	.bar-fill { height: 100%; background: var(--ember); border-radius: 999px; transition: width 0.4s var(--ease); }
	.bar-fill.done { background: var(--sage); }
	.bar-pct { font-size: 11px; color: var(--text-faint); font-family: var(--font-mono); margin-top: -4px; }

	/* Sparkline */
	.spark { width: 100%; height: 44px; display: block; margin-top: 2px; }
	.spark-line { stroke: var(--text-muted); stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
	.spark-line.trend-up { stroke: var(--sage); }
	.spark-line.trend-down { stroke: var(--danger); }
	.spark-line.trend-flat { stroke: var(--ember-bright); }
	.spark-empty { margin: 4px 0; font-size: 12px; color: var(--text-faint); text-align: center; padding: 12px 0; }

	.card-meta { display: flex; justify-content: flex-end; }
	.meta-pts { font-size: 11px; color: var(--text-faint); font-family: var(--font-mono); }

	.card-actions { display: flex; gap: 7px; margin-top: auto; padding-top: 6px; flex-wrap: wrap; }

	/* Empty state */
	.empty { text-align: center; padding: 48px 20px; background: var(--surface-1); border: 1px dashed var(--border); border-radius: var(--radius-lg); display: flex; flex-direction: column; align-items: center; gap: 8px; }
	.empty .big { font-size: 36px; }
	.empty h3 { font-size: 16px; }
	.empty p { margin: 0; color: var(--text-muted); font-size: 13.5px; max-width: 420px; }
	.empty .btn { margin-top: 10px; }
	.examples { margin-top: 22px; display: flex; flex-direction: column; align-items: center; gap: 10px; }
	.ex-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.09em; font-family: var(--font-mono); color: var(--text-faint); }
	.ex-chips { display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; }
	.chip { font-size: 12.5px; color: var(--text-muted); background: var(--surface-2); border: 1px solid var(--border-soft); border-radius: 999px; padding: 6px 13px; transition: all 0.14s; }
	.chip:hover { color: var(--ember-bright); border-color: var(--ember-line); background: var(--ember-soft); }

	/* Inputs (shared) */
	input[type='text'], input[type='number'] {
		width: 100%; background: var(--bg); border: 1px solid var(--border); border-radius: 9px; color: var(--text);
		padding: 10px 12px; font-family: var(--font-body); font-size: 13.5px;
	}
	input:focus { outline: none; border-color: var(--ember-line); }
	.hint-note { margin: 0; font-size: 12px; color: var(--text-faint); line-height: 1.45; }

	/* Dialog */
	.overlay { position: fixed; inset: 0; background: rgba(8, 6, 4, 0.66); backdrop-filter: blur(3px); display: grid; place-items: center; padding: 20px; z-index: 100; }
	.dialog { width: 100%; max-width: 480px; max-height: 88vh; overflow-y: auto; background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 22px; box-shadow: var(--shadow); }
	.dialog.small { max-width: 360px; }
	.dhead { display: flex; align-items: center; gap: 12px; margin-bottom: 18px; }
	.dhead h3 { font-size: 16px; }
	.emoji.big { font-size: 30px; line-height: 1; }
	.eyebrow { font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--text-faint); }
	.fields { display: flex; flex-direction: column; gap: 12px; }
	.fields .two { display: flex; gap: 12px; }
	.fields .two label.grow { flex: 1; min-width: 0; }
	.fields label span { display: block; font-size: 12.5px; color: var(--text-muted); margin-bottom: 5px; }
	.dactions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px; }

	/* Mobile */
	@media (max-width: 640px) {
		.scroll { padding: 20px 16px 40px; }
		.section-head { flex-direction: column; }
		.grid { grid-template-columns: 1fr; }
		.fields .two { flex-direction: column; }
	}
</style>
