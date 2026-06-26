<script lang="ts">
	import AppHeader from '$lib/components/AppHeader.svelte';
	import { i18n } from '$lib/stores/i18n.svelte';

	// KI-Zusammenfassung der Quellen folgt in Verfeinerung (über /api/chat).

	type Result = { title: string; url: string; snippet: string };

	let query = $state('');
	let results = $state<Result[]>([]);
	let loading = $state(false);
	let error = $state('');
	let searched = $state(false);

	const examples = $derived([
		i18n.t('research.example1'),
		i18n.t('research.example2'),
		i18n.t('research.example3'),
		i18n.t('research.example4')
	]);

	async function search() {
		const q = query.trim();
		if (!q || loading) return;
		loading = true;
		error = '';
		searched = true;
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
		}
	}

	function onKey(e: KeyboardEvent) {
		if (e.key === 'Enter') search();
	}

	function useExample(q: string) {
		query = q;
		search();
	}

	function domain(url: string): string {
		try {
			return new URL(url).hostname.replace(/^www\./, '');
		} catch {
			return url;
		}
	}
</script>

<AppHeader title={i18n.t('research.title')} eyebrow={i18n.t('research.eyebrow')} />

<div class="scroll">
	<div class="searchbar">
		<svg class="ico" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
			<circle cx="11" cy="11" r="7" />
			<path d="m21 21-4.3-4.3" />
		</svg>
		<input
			type="text"
			bind:value={query}
			onkeydown={onKey}
			placeholder={i18n.t('research.searchPlaceholder')}
			aria-label={i18n.t('research.searchLabel')}
		/>
		<button class="btn primary" onclick={search} disabled={loading || !query.trim()}>
			{loading ? i18n.t('research.searching') : i18n.t('research.search')}
		</button>
	</div>

	{#if loading}
		<div class="state-line">
			<span class="spinner" aria-hidden="true"></span>
			<span>{i18n.t('research.browsing')}</span>
		</div>
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
				<circle cx="11" cy="11" r="7" />
				<path d="m21 21-4.3-4.3" />
			</svg>
			<p class="empty-lead">{i18n.t('research.emptyLead')}</p>
			<p class="empty-sub">{i18n.t('research.emptySub')}</p>
			<div class="chips">
				{#each examples as ex (ex)}
					<button class="chip" onclick={() => useExample(ex)}>{ex}</button>
				{/each}
			</div>
		</div>
	{/if}
</div>

<style>
	.scroll {
		flex: 1;
		overflow-y: auto;
		padding: 24px 28px 40px;
	}

	.searchbar {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 8px 8px 8px 14px;
		background: var(--surface-1);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		max-width: 720px;
	}
	.searchbar:focus-within {
		border-color: var(--ember-line);
	}
	.searchbar .ico {
		color: var(--text-faint);
		flex: none;
	}
	.searchbar input {
		flex: 1;
		background: transparent;
		border: none;
		outline: none;
		color: var(--text);
		font-family: var(--font-body);
		font-size: 15px;
		padding: 6px 0;
	}
	.searchbar input::placeholder {
		color: var(--text-faint);
	}

	.btn {
		font-family: var(--font-body);
		font-size: 14px;
		padding: 9px 18px;
		border-radius: var(--radius-sm);
		border: 1px solid transparent;
		cursor: pointer;
		flex: none;
	}
	.btn.primary {
		background: var(--ember);
		color: var(--bg);
		font-weight: 600;
	}
	.btn.primary:hover:not(:disabled) {
		background: var(--ember-bright);
	}
	.btn:disabled {
		opacity: 0.5;
		cursor: default;
	}

	.state-line {
		display: flex;
		align-items: center;
		gap: 10px;
		margin-top: 28px;
		color: var(--text-muted);
		font-size: 14px;
	}
	.spinner {
		width: 16px;
		height: 16px;
		border: 2px solid var(--border);
		border-top-color: var(--ember);
		border-radius: 50%;
		animation: spin 0.7s linear infinite;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.notice {
		margin-top: 24px;
		padding: 14px 16px;
		background: var(--surface-1);
		border: 1px solid var(--border-soft);
		border-radius: var(--radius-sm);
		color: var(--text-muted);
		font-size: 14px;
		max-width: 720px;
	}

	.meta {
		margin: 24px 0 12px;
		color: var(--text-faint);
		font-family: var(--font-mono);
		font-size: 12px;
	}

	.list {
		display: flex;
		flex-direction: column;
		gap: 12px;
		max-width: 820px;
	}
	.card {
		padding: 16px 18px;
		background: var(--surface-1);
		border: 1px solid var(--border-soft);
		border-radius: var(--radius-sm);
	}
	.card:hover {
		border-color: var(--border);
	}
	.title {
		display: inline-block;
		color: var(--text);
		font-size: 16px;
		font-weight: 600;
		text-decoration: none;
		line-height: 1.35;
	}
	.title:hover {
		color: var(--ember-bright);
	}
	.url {
		display: block;
		margin-top: 3px;
		color: var(--sage);
		font-family: var(--font-mono);
		font-size: 12px;
	}
	.snip {
		margin-top: 8px;
		color: var(--text-muted);
		font-size: 14px;
		line-height: 1.55;
	}

	.empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		gap: 8px;
		margin-top: 64px;
		color: var(--text-muted);
	}
	.big-ico {
		color: var(--text-faint);
		margin-bottom: 6px;
	}
	.empty-lead {
		font-size: 15px;
		color: var(--text);
		max-width: 420px;
	}
	.empty-sub {
		font-size: 13px;
		color: var(--text-faint);
		margin-top: 8px;
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		justify-content: center;
		margin-top: 6px;
		max-width: 560px;
	}
	.chip {
		padding: 7px 14px;
		background: var(--surface-2);
		border: 1px solid var(--border-soft);
		border-radius: 999px;
		color: var(--text-muted);
		font-family: var(--font-body);
		font-size: 13px;
		cursor: pointer;
	}
	.chip:hover {
		border-color: var(--ember-line);
		color: var(--text);
	}
</style>
