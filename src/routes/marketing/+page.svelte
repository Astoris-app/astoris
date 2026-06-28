<script lang="ts">
	import { onMount } from 'svelte';
	import AppHeader from '$lib/components/AppHeader.svelte';
	import { i18n } from '$lib/stores/i18n.svelte';
	import { renderMarkdown } from '$lib/markdown';
	import { dictation } from '$lib/actions/dictation';

	// ---------- Types ----------
	type Tool = 'content' | 'social' | 'ads' | 'campaign' | 'googleAds';
	type GaKeyword = { text: string; matchType: string };
	type GaAdGroup = { name: string; keywords: GaKeyword[]; headlines: string[]; descriptions: string[]; path1: string; path2: string };
	type GaCampaign = { campaignName: string; budgetEUR: number; finalUrl: string; adGroups: GaAdGroup[] };
	type Entry = { id: string; label: string; result: string; at: string; data?: GaCampaign };
	type ToolState = { last: Entry | null; history: Entry[] };
	type Marketing = Record<Tool, ToolState>;

	// Generische Werkzeuge (Markdown-Ergebnis); googleAds wird separat strukturiert gerendert.
	const TOOLS: Tool[] = ['content', 'social', 'ads', 'campaign'];
	const SOCIAL_PLATFORMS = ['linkedin', 'x', 'instagram'] as const;
	const ADS_PLATFORMS = ['google', 'meta'] as const;

	function emptyTool(): ToolState {
		return { last: null, history: [] };
	}

	// ---------- State ----------
	let tab = $state<Tool>('content');
	let marketing = $state<Marketing>({ content: emptyTool(), social: emptyTool(), ads: emptyTool(), campaign: emptyTool(), googleAds: emptyTool() });
	let loading = $state(true);
	let busy = $state<Tool | null>(null);
	let errors = $state<Record<Tool, string>>({ content: '', social: '', ads: '', campaign: '', googleAds: '' });
	// Freshly generated result per tool (kept separate so it's visible immediately, top of the list).
	let fresh = $state<Record<Tool, string>>({ content: '', social: '', ads: '', campaign: '', googleAds: '' });
	let copied = $state<string | null>(null);
	let downloading = $state(false);

	// Inputs
	let contentTopic = $state('');
	let socialTopic = $state('');
	let socialPlatform = $state<(typeof SOCIAL_PLATFORMS)[number]>('linkedin');
	let adsOffer = $state('');
	let adsPlatform = $state<(typeof ADS_PLATFORMS)[number]>('google');
	let campaignGoal = $state('');
	let gaOffer = $state('');
	let gaUrl = $state('');
	let gaBudget = $state('');

	// ---------- Loaders ----------
	function applyMarketing(m: any) {
		const safe = (t: any): ToolState => ({
			last: t?.last ?? null,
			history: Array.isArray(t?.history) ? t.history : []
		});
		marketing = {
			content: safe(m?.content),
			social: safe(m?.social),
			ads: safe(m?.ads),
			campaign: safe(m?.campaign),
			googleAds: safe(m?.googleAds)
		};
	}

	async function loadMarketing() {
		try {
			const res = await fetch('/api/marketing');
			const data = await res.json();
			applyMarketing(data?.marketing ?? {});
		} catch {
			applyMarketing({});
		}
	}

	onMount(async () => {
		await loadMarketing();
		loading = false;
	});

	// ---------- Generate ----------
	async function generate(tool: Tool, payload: Record<string, unknown>) {
		if (busy) return;
		busy = tool;
		errors[tool] = '';
		fresh[tool] = '';
		try {
			const res = await fetch('/api/marketing', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(payload)
			});
			const data = await res.json();
			if (data?.ok && data?.result) {
				fresh[tool] = data.result;
				if (data.marketing) applyMarketing(data.marketing);
			} else {
				errors[tool] = (data?.message ?? '').toString() || i18n.t('marketing.failed');
			}
		} catch {
			errors[tool] = i18n.t('marketing.networkError');
		} finally {
			busy = null;
		}
	}

	function genContent() {
		if (!contentTopic.trim()) return;
		generate('content', { action: 'generate-content', topic: contentTopic.trim() });
	}
	function genSocial() {
		if (!socialTopic.trim()) return;
		generate('social', { action: 'generate-social', topic: socialTopic.trim(), platform: socialPlatform });
	}
	function genAds() {
		if (!adsOffer.trim()) return;
		generate('ads', { action: 'generate-ads', offer: adsOffer.trim(), platform: adsPlatform });
	}
	function genCampaign() {
		if (!campaignGoal.trim()) return;
		generate('campaign', { action: 'generate-campaign', goal: campaignGoal.trim() });
	}
	function genGoogleAds() {
		const offer = gaOffer.trim();
		const url = gaUrl.trim();
		if (!offer || !url) return;
		if (!/^https?:\/\//i.test(url)) {
			errors.googleAds = i18n.t('marketing.googleAdsInvalidUrl');
			return;
		}
		const budget = Number(gaBudget);
		generate('googleAds', {
			action: 'generate-google-ads',
			offer,
			finalUrl: url,
			...(Number.isFinite(budget) && budget > 0 ? { budget } : {})
		});
	}

	// Lädt die gespeicherte Kampagne als Google-Ads-Editor-CSV (UTF-16 LE) herunter.
	async function downloadGoogleAdsCsv() {
		if (downloading) return;
		downloading = true;
		try {
			const res = await fetch('/api/marketing?action=google-ads-csv');
			if (!res.ok) {
				errors.googleAds = i18n.t('marketing.failed');
				return;
			}
			const blob = await res.blob();
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = 'astoris-kampagne.csv';
			document.body.appendChild(a);
			a.click();
			a.remove();
			setTimeout(() => URL.revokeObjectURL(url), 1000);
		} catch {
			errors.googleAds = i18n.t('marketing.networkError');
		} finally {
			downloading = false;
		}
	}

	// Aktuelle Google-Ads-Kampagne (frisch erzeugt oder zuletzt gespeichert).
	function gaEntry(): Entry | null {
		return marketing.googleAds.last;
	}

	async function clearTool(tool: Tool) {
		if (busy) return;
		if (!confirm(i18n.t('marketing.clearConfirm'))) return;
		fresh[tool] = '';
		errors[tool] = '';
		try {
			const res = await fetch('/api/marketing', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ action: 'clear', tool })
			});
			const data = await res.json();
			if (data?.marketing) applyMarketing(data.marketing);
		} catch {
			/* leave state as-is on failure */
		}
	}

	async function copy(id: string, text: string) {
		try {
			await navigator.clipboard.writeText(text);
			copied = id;
			setTimeout(() => (copied === id ? (copied = null) : null), 1600);
		} catch {
			/* clipboard unavailable */
		}
	}

	// ---------- Helpers ----------
	function fmtDate(iso: string): string {
		try {
			return new Date(iso).toLocaleString(i18n.lang === 'en' ? 'en-GB' : 'de-DE', {
				day: '2-digit',
				month: '2-digit',
				hour: '2-digit',
				minute: '2-digit'
			});
		} catch {
			return '';
		}
	}
	// The most recent stored result for a tool (freshly generated wins; else persisted "last").
	function currentResult(tool: Tool): { id: string; result: string; at: string; label: string } | null {
		if (fresh[tool]) {
			const last = marketing[tool].last;
			return { id: 'fresh-' + tool, result: fresh[tool], at: last?.at ?? '', label: last?.label ?? '' };
		}
		const last = marketing[tool].last;
		return last ? { id: last.id, result: last.result, at: last.at, label: last.label } : null;
	}
	function platformLabel(p: string): string {
		const map: Record<string, string> = {
			linkedin: 'marketing.platformLinkedin',
			x: 'marketing.platformX',
			instagram: 'marketing.platformInstagram',
			google: 'marketing.platformGoogle',
			meta: 'marketing.platformMeta'
		};
		return map[p] ? i18n.t(map[p]) : p;
	}
</script>

<AppHeader title={i18n.t('marketing.title')} eyebrow={i18n.t('marketing.eyebrow')} />

<div class="scroll">
	<!-- Tab switcher -->
	<div class="tabs" role="tablist">
		<button class="tab" class:on={tab === 'content'} role="tab" aria-selected={tab === 'content'} onclick={() => (tab = 'content')}>
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11h6M9 15h4M7 4h10a1 1 0 0 1 1 1v15l-3-2-3 2-3-2-3 2V5a1 1 0 0 1 1-1z" /></svg>
			{i18n.t('marketing.tabContent')}
		</button>
		<button class="tab" class:on={tab === 'social'} role="tab" aria-selected={tab === 'social'} onclick={() => (tab = 'social')}>
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="2.5" /><circle cx="6" cy="12" r="2.5" /><circle cx="18" cy="19" r="2.5" /><path d="M8.2 10.8l7.6-4.4M8.2 13.2l7.6 4.4" /></svg>
			{i18n.t('marketing.tabSocial')}
		</button>
		<button class="tab" class:on={tab === 'ads'} role="tab" aria-selected={tab === 'ads'} onclick={() => (tab = 'ads')}>
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11v2a1 1 0 0 0 1 1h3l5 4V6L7 10H4a1 1 0 0 0-1 1zM16 9a4 4 0 0 1 0 6M19 6a8 8 0 0 1 0 12" /></svg>
			{i18n.t('marketing.tabAds')}
		</button>
		<button class="tab" class:on={tab === 'campaign'} role="tab" aria-selected={tab === 'campaign'} onclick={() => (tab = 'campaign')}>
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16M4 12h16M4 18h10" /><circle cx="18" cy="18" r="2.5" /></svg>
			{i18n.t('marketing.tabCampaign')}
		</button>
		<button class="tab" class:on={tab === 'googleAds'} role="tab" aria-selected={tab === 'googleAds'} onclick={() => (tab = 'googleAds')}>
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 5h18v11H3z" /><path d="M8 20h8M12 16v4" /><path d="m8 12 2.4-3.2L13 11l3-4" /></svg>
			{i18n.t('marketing.tabGoogleAds')}
		</button>
	</div>

	{#if loading}
		<p class="muted">{i18n.t('marketing.loading')}</p>
	{:else}
		<!-- Each tool: one tab body. -->
		{#each TOOLS as t (t)}
			{#if tab === t}
				{@const cur = currentResult(t)}
				<div class="tool">
					<p class="lead">{i18n.t('marketing.' + t + 'Lead')}</p>

					<div class="form">
						{#if t === 'content'}
							<label>
								<span>{i18n.t('marketing.contentTopicLabel')}</span>
								<textarea rows="2" placeholder={i18n.t('marketing.contentTopicPlaceholder')} bind:value={contentTopic} use:dictation={{ getText: () => contentTopic, append: (s) => contentTopic = (contentTopic ? contentTopic + ' ' : '') + s }}></textarea>
							</label>
							<div class="actions">
								<button class="btn primary" onclick={genContent} disabled={busy === 'content' || !contentTopic.trim()}>
									{busy === 'content' ? i18n.t('marketing.generating') : i18n.t('marketing.generate')}
								</button>
							</div>
						{:else if t === 'social'}
							<label>
								<span>{i18n.t('marketing.socialTopicLabel')}</span>
								<textarea rows="2" placeholder={i18n.t('marketing.socialTopicPlaceholder')} bind:value={socialTopic} use:dictation={{ getText: () => socialTopic, append: (s) => socialTopic = (socialTopic ? socialTopic + ' ' : '') + s }}></textarea>
							</label>
							<div class="row">
								<label class="grow">
									<span>{i18n.t('marketing.platform')}</span>
									<select bind:value={socialPlatform}>
										{#each SOCIAL_PLATFORMS as p (p)}<option value={p}>{platformLabel(p)}</option>{/each}
									</select>
								</label>
								<div class="actions grow-end">
									<button class="btn primary" onclick={genSocial} disabled={busy === 'social' || !socialTopic.trim()}>
										{busy === 'social' ? i18n.t('marketing.generating') : i18n.t('marketing.generate')}
									</button>
								</div>
							</div>
						{:else if t === 'ads'}
							<label>
								<span>{i18n.t('marketing.adsOfferLabel')}</span>
								<textarea rows="2" placeholder={i18n.t('marketing.adsOfferPlaceholder')} bind:value={adsOffer} use:dictation={{ getText: () => adsOffer, append: (s) => adsOffer = (adsOffer ? adsOffer + ' ' : '') + s }}></textarea>
							</label>
							<div class="row">
								<label class="grow">
									<span>{i18n.t('marketing.platform')}</span>
									<select bind:value={adsPlatform}>
										{#each ADS_PLATFORMS as p (p)}<option value={p}>{platformLabel(p)}</option>{/each}
									</select>
								</label>
								<div class="actions grow-end">
									<button class="btn primary" onclick={genAds} disabled={busy === 'ads' || !adsOffer.trim()}>
										{busy === 'ads' ? i18n.t('marketing.generating') : i18n.t('marketing.generate')}
									</button>
								</div>
							</div>
						{:else}
							<label>
								<span>{i18n.t('marketing.campaignGoalLabel')}</span>
								<textarea rows="2" placeholder={i18n.t('marketing.campaignGoalPlaceholder')} bind:value={campaignGoal} use:dictation={{ getText: () => campaignGoal, append: (s) => campaignGoal = (campaignGoal ? campaignGoal + ' ' : '') + s }}></textarea>
							</label>
							<div class="actions">
								<button class="btn primary" onclick={genCampaign} disabled={busy === 'campaign' || !campaignGoal.trim()}>
									{busy === 'campaign' ? i18n.t('marketing.generating') : i18n.t('marketing.generate')}
								</button>
							</div>
						{/if}
					</div>

					{#if errors[t]}
						<div class="notice">{errors[t]}</div>
					{/if}

					{#if busy === t}
						<div class="result-box pending">
							<span class="spinner"></span>
							<span>{i18n.t('marketing.generating')}</span>
						</div>
					{:else if cur}
						<div class="result-box">
							<div class="result-head">
								<div class="result-meta">
									<span class="result-title">{i18n.t('marketing.result')}</span>
									{#if cur.at}<span class="result-time">{fmtDate(cur.at)}</span>{/if}
								</div>
								<div class="result-tools">
									<button class="mini-btn" onclick={() => copy(cur.id, cur.result)}>
										{copied === cur.id ? i18n.t('marketing.copied') : i18n.t('marketing.copy')}
									</button>
									<button class="mini-btn danger" onclick={() => clearTool(t)}>{i18n.t('marketing.clear')}</button>
								</div>
							</div>
							<div class="md result-md">{@html renderMarkdown(cur.result)}</div>
						</div>

						{#if marketing[t].history.length}
							<details class="history">
								<summary>{i18n.t('marketing.history')} · {marketing[t].history.length}</summary>
								<div class="history-list">
									{#each marketing[t].history as h (h.id)}
										<article class="hist-item">
											<div class="hist-head">
												{#if h.label}<span class="hist-label">{h.label}</span>{/if}
												<span class="hist-time">{fmtDate(h.at)}</span>
												<button class="mini-btn" onclick={() => copy(h.id, h.result)}>
													{copied === h.id ? i18n.t('marketing.copied') : i18n.t('marketing.copy')}
												</button>
											</div>
											<div class="md result-md small">{@html renderMarkdown(h.result)}</div>
										</article>
									{/each}
								</div>
							</details>
						{/if}
					{:else}
						<div class="empty">
							<span class="big">✨</span>
							<p>{i18n.t('marketing.noResult')}</p>
						</div>
					{/if}
				</div>
			{/if}
		{/each}

		<!-- Google-Ads-Kampagne: strukturierte Eingabe + Anzeige + CSV-Export. -->
		{#if tab === 'googleAds'}
			{@const ga = gaEntry()}
			<div class="tool">
				<p class="lead">{i18n.t('marketing.googleAdsLead')}</p>

				<div class="form">
					<label>
						<span>{i18n.t('marketing.googleAdsOfferLabel')}</span>
						<textarea rows="2" placeholder={i18n.t('marketing.googleAdsOfferPlaceholder')} bind:value={gaOffer} use:dictation={{ getText: () => gaOffer, append: (s) => gaOffer = (gaOffer ? gaOffer + ' ' : '') + s }}></textarea>
					</label>
					<div class="row">
						<label class="grow">
							<span>{i18n.t('marketing.googleAdsUrlLabel')}</span>
							<input type="url" inputmode="url" placeholder={i18n.t('marketing.googleAdsUrlPlaceholder')} bind:value={gaUrl} />
						</label>
						<label class="budget">
							<span>{i18n.t('marketing.googleAdsBudgetLabel')}</span>
							<input type="number" min="0" step="1" placeholder={i18n.t('marketing.googleAdsBudgetPlaceholder')} bind:value={gaBudget} />
						</label>
					</div>
					<div class="actions">
						<button class="btn primary" onclick={genGoogleAds} disabled={busy === 'googleAds' || !gaOffer.trim() || !gaUrl.trim()}>
							{busy === 'googleAds' ? i18n.t('marketing.generating') : i18n.t('marketing.generate')}
						</button>
					</div>
				</div>

				{#if errors.googleAds}
					<div class="notice">{errors.googleAds}</div>
				{/if}

				{#if busy === 'googleAds'}
					<div class="result-box pending">
						<span class="spinner"></span>
						<span>{i18n.t('marketing.generating')}</span>
					</div>
				{:else if ga && ga.data}
					{@const c = ga.data}
					<div class="result-box">
						<div class="result-head">
							<div class="result-meta">
								<span class="result-title">{i18n.t('marketing.result')}</span>
								{#if ga.at}<span class="result-time">{fmtDate(ga.at)}</span>{/if}
							</div>
							<div class="result-tools">
								<button class="mini-btn" onclick={() => copy(ga.id, ga.result)}>
									{copied === ga.id ? i18n.t('marketing.copied') : i18n.t('marketing.copy')}
								</button>
								<button class="mini-btn" onclick={downloadGoogleAdsCsv} disabled={downloading}>
									{i18n.t('marketing.googleAdsExportCsv')}
								</button>
								<button class="mini-btn danger" onclick={() => clearTool('googleAds')}>{i18n.t('marketing.clear')}</button>
							</div>
						</div>

						<div class="ga">
							<h2 class="ga-name">{c.campaignName}</h2>
							<div class="ga-sub">
								<span><strong>{i18n.t('marketing.googleAdsBudgetField')}:</strong> {c.budgetEUR} EUR</span>
								<span class="ga-url"><strong>{i18n.t('marketing.googleAdsFinalUrl')}:</strong> {c.finalUrl}</span>
							</div>

							{#each c.adGroups as g, gi (gi)}
								<section class="ga-group">
									<h3>{gi + 1}. {g.name}</h3>
									{#if g.keywords.length}
										<div class="ga-block">
											<span class="ga-label">{i18n.t('marketing.googleAdsKeywords')}</span>
											<div class="kw-list">
												{#each g.keywords as k, ki (ki)}
													<span class="kw">{k.text}<em>{k.matchType}</em></span>
												{/each}
											</div>
										</div>
									{/if}
									{#if g.headlines.length}
										<div class="ga-block">
											<span class="ga-label">{i18n.t('marketing.googleAdsHeadlines')}</span>
											<ol class="ga-ol">
												{#each g.headlines as h, hi (hi)}<li>{h}</li>{/each}
											</ol>
										</div>
									{/if}
									{#if g.descriptions.length}
										<div class="ga-block">
											<span class="ga-label">{i18n.t('marketing.googleAdsDescriptions')}</span>
											<ol class="ga-ol">
												{#each g.descriptions as d, di (di)}<li>{d}</li>{/each}
											</ol>
										</div>
									{/if}
									{#if g.path1 || g.path2}
										<div class="ga-path">{i18n.t('marketing.googleAdsPath')}: /{g.path1}{g.path2 ? '/' + g.path2 : ''}</div>
									{/if}
								</section>
							{/each}
						</div>
					</div>
				{:else}
					<div class="empty">
						<span class="big">📣</span>
						<p>{i18n.t('marketing.noResult')}</p>
					</div>
				{/if}
			</div>
		{/if}
	{/if}
</div>

<style>
	.scroll { flex: 1; overflow-y: auto; padding: 24px 28px 48px; }
	.muted { color: var(--text-faint); }

	/* Tabs */
	.tabs { display: inline-flex; gap: 4px; padding: 4px; background: var(--surface-1); border: 1px solid var(--border-soft); border-radius: 999px; margin-bottom: 24px; flex-wrap: wrap; }
	.tab { display: flex; align-items: center; gap: 8px; padding: 8px 16px; border-radius: 999px; font-size: 13.5px; font-weight: 500; color: var(--text-muted); background: transparent; border: none; transition: all 0.16s; }
	.tab svg { width: 16px; height: 16px; }
	.tab:hover { color: var(--text); }
	.tab.on { background: var(--surface-3); color: var(--text); }

	.tool { display: flex; flex-direction: column; gap: 18px; max-width: 820px; }
	.lead { color: var(--text-muted); margin: 0; max-width: 640px; }

	/* Form */
	.form { display: flex; flex-direction: column; gap: 14px; background: var(--surface-1); border: 1px solid var(--border-soft); border-radius: var(--radius); padding: 18px; }
	.form .row { display: flex; gap: 14px; align-items: flex-end; }
	.form .grow { flex: 1; min-width: 0; }
	.form .grow-end { flex: none; }
	.form label span { display: block; font-size: 12.5px; color: var(--text-muted); margin-bottom: 5px; }
	.actions { display: flex; justify-content: flex-end; }

	textarea, select, input {
		width: 100%; background: var(--bg); border: 1px solid var(--border); border-radius: 9px; color: var(--text);
		padding: 10px 12px; font-family: var(--font-body); font-size: 13.5px;
	}
	textarea { resize: vertical; line-height: 1.5; }
	select { cursor: pointer; }
	textarea:focus, select:focus, input:focus { outline: none; border-color: var(--ember-line); }
	.form .budget { flex: none; width: 180px; }

	/* Buttons */
	.btn { display: inline-flex; align-items: center; gap: 7px; border-radius: 9px; padding: 9px 18px; font-size: 13px; font-weight: 500; border: 1px solid transparent; transition: all 0.16s; white-space: nowrap; }
	.btn:disabled { opacity: 0.45; cursor: not-allowed; }
	.btn.primary { background: var(--ember); color: #1a1206; }
	.btn.primary:not(:disabled):hover { background: var(--ember-bright); }

	.mini-btn { font-size: 12px; color: var(--text-muted); background: var(--surface-2); border: 1px solid var(--border-soft); border-radius: 7px; padding: 5px 10px; transition: all 0.14s; }
	.mini-btn:hover { color: var(--text); border-color: var(--border); }
	.mini-btn:disabled { opacity: 0.5; cursor: not-allowed; }
	.mini-btn.danger:hover { color: var(--danger); border-color: var(--danger-soft); background: var(--danger-soft); }

	/* Notice (error / skip-on-fail message) */
	.notice { background: var(--ember-soft); border: 1px solid var(--ember-line); border-radius: var(--radius-sm); padding: 11px 14px; font-size: 13px; color: var(--ember-bright); line-height: 1.5; }

	/* Result box */
	.result-box { background: var(--surface-1); border: 1px solid var(--border-soft); border-radius: var(--radius); padding: 16px 18px; }
	.result-box.pending { display: flex; align-items: center; gap: 10px; color: var(--text-muted); font-size: 13.5px; }
	.result-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px; flex-wrap: wrap; }
	.result-meta { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
	.result-title { font-size: 11px; text-transform: uppercase; letter-spacing: 0.09em; font-family: var(--font-mono); color: var(--text-faint); }
	.result-time { font-size: 12px; color: var(--text-faint); font-family: var(--font-mono); }
	.result-tools { display: flex; gap: 7px; }

	.spinner { width: 15px; height: 15px; border: 2px solid var(--border); border-top-color: var(--ember); border-radius: 50%; animation: spin 0.7s linear infinite; }
	@keyframes spin { to { transform: rotate(360deg); } }

	/* Empty */
	.empty { text-align: center; padding: 40px 20px; background: var(--surface-1); border: 1px dashed var(--border); border-radius: var(--radius-lg); display: flex; flex-direction: column; align-items: center; gap: 8px; }
	.empty .big { font-size: 32px; }
	.empty p { margin: 0; color: var(--text-muted); font-size: 13.5px; max-width: 420px; }

	/* History */
	.history { background: var(--surface-1); border: 1px solid var(--border-soft); border-radius: var(--radius); padding: 4px 14px; }
	.history summary { cursor: pointer; padding: 10px 0; font-size: 12.5px; color: var(--text-muted); font-family: var(--font-mono); }
	.history summary:hover { color: var(--text); }
	.history-list { display: flex; flex-direction: column; gap: 10px; padding: 6px 0 12px; }
	.hist-item { border-top: 1px solid var(--border-soft); padding-top: 10px; }
	.hist-head { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; flex-wrap: wrap; }
	.hist-label { font-size: 12.5px; color: var(--text); font-weight: 500; }
	.hist-time { font-size: 11.5px; color: var(--text-faint); font-family: var(--font-mono); margin-right: auto; }

	/* Markdown */
	.result-md { font-size: 13.5px; line-height: 1.6; color: var(--text); }
	.result-md.small { font-size: 12.5px; color: var(--text-muted); }
	.md :global(p) { margin: 0 0 8px; }
	.md :global(p:last-child) { margin-bottom: 0; }
	.md :global(ul), .md :global(ol) { margin: 0 0 8px; padding-left: 20px; }
	.md :global(li) { margin: 2px 0; }
	.md :global(h1), .md :global(h2), .md :global(h3), .md :global(h4) { font-size: 14px; margin: 12px 0 6px; }
	.md :global(strong) { color: var(--text); }
	.md :global(pre) { background: var(--surface-2); border: 1px solid var(--border-soft); border-radius: 8px; padding: 11px; overflow-x: auto; font-family: var(--font-mono); font-size: 12px; }
	.md :global(code) { font-family: var(--font-mono); font-size: 12px; }
	.md :global(hr) { border: none; border-top: 1px solid var(--border-soft); margin: 12px 0; }
	.md :global(a) { color: var(--ember-bright); }

	/* Google-Ads-Kampagne (strukturierte Anzeige) */
	.ga { display: flex; flex-direction: column; gap: 14px; }
	.ga-name { font-size: 17px; margin: 0; color: var(--text); }
	.ga-sub { display: flex; flex-wrap: wrap; gap: 6px 18px; font-size: 12.5px; color: var(--text-muted); }
	.ga-sub strong { color: var(--text); font-weight: 500; }
	.ga-url { word-break: break-all; }
	.ga-group { border: 1px solid var(--border-soft); border-radius: var(--radius-sm); padding: 12px 14px; background: var(--surface-2); display: flex; flex-direction: column; gap: 10px; }
	.ga-group h3 { font-size: 14px; margin: 0; color: var(--text); }
	.ga-block { display: flex; flex-direction: column; gap: 5px; }
	.ga-label { font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.08em; font-family: var(--font-mono); color: var(--text-faint); }
	.kw-list { display: flex; flex-wrap: wrap; gap: 6px; }
	.kw { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; background: var(--surface-1); border: 1px solid var(--border-soft); border-radius: 7px; padding: 3px 8px; color: var(--text); }
	.kw em { font-style: normal; font-size: 10px; color: var(--text-faint); font-family: var(--font-mono); text-transform: uppercase; }
	.ga-ol { margin: 0; padding-left: 20px; display: flex; flex-direction: column; gap: 2px; }
	.ga-ol li { font-size: 13px; color: var(--text); line-height: 1.45; }
	.ga-path { font-size: 12px; color: var(--text-muted); font-family: var(--font-mono); }

	/* Mobile */
	@media (max-width: 640px) {
		.scroll { padding: 20px 16px 40px; }
		.tabs { display: flex; flex-wrap: wrap; }
		.tab { flex: 1; justify-content: center; }
		.form .row { flex-direction: column; align-items: stretch; }
		.form .budget { width: 100%; }
		.actions { justify-content: stretch; }
		.btn.primary { width: 100%; justify-content: center; }
		.result-tools { flex-wrap: wrap; }
	}
</style>
