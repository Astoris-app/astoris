<script lang="ts">
	import AppHeader from '$lib/components/AppHeader.svelte';
	import { i18n } from '$lib/stores/i18n.svelte';

	// Ablage mit Upload, Volltextsuche und KI-Zusammenfassung.

	type Doc = { id: string; name: string; size: number; type: string; uploadedAt: string };
	type Hit = { id: string; name: string; type: string; searchable: boolean; matched: boolean; snippet: string };

	const TEXT_EXTS = ['.txt', '.md', '.csv', '.json', '.log', '.html'];

	let docs = $state<Doc[]>([]);
	let loading = $state(true);
	let uploading = $state(false);
	let dragOver = $state(false);
	let error = $state('');
	let toDelete = $state<Doc | null>(null);
	let fileInput: HTMLInputElement;

	// Search state
	let query = $state('');
	let searching = $state(false);
	let hits = $state<Hit[] | null>(null);

	// Summary state, keyed by doc id
	let summaries = $state<Record<string, string>>({});
	let summaryLoading = $state<Record<string, boolean>>({});
	let summaryError = $state<Record<string, string>>({});
	let summaryOpen = $state<Record<string, boolean>>({});

	// True if a document is summarizable/searchable (text-based) on the client.
	function isTextDoc(doc: Doc): boolean {
		const lower = doc.name.toLowerCase();
		if (TEXT_EXTS.some((e) => lower.endsWith(e))) return true;
		return (doc.type || '').toLowerCase().startsWith('text/');
	}

	async function runSearch() {
		const q = query.trim();
		if (!q) {
			hits = null;
			return;
		}
		searching = true;
		error = '';
		try {
			const res = await fetch(`/api/docs?search=${encodeURIComponent(q)}`);
			if (!res.ok) throw new Error(i18n.t('docs.searchFailed'));
			const data = await res.json();
			hits = data.hits ?? [];
		} catch (e: any) {
			error = e?.message ?? i18n.t('docs.searchFailed');
		} finally {
			searching = false;
		}
	}

	function clearSearch() {
		query = '';
		hits = null;
	}

	async function summarize(doc: Doc) {
		summaryOpen = { ...summaryOpen, [doc.id]: true };
		if (summaries[doc.id]) return; // already loaded
		summaryLoading = { ...summaryLoading, [doc.id]: true };
		summaryError = { ...summaryError, [doc.id]: '' };
		try {
			const res = await fetch(`/api/docs?summarize=${doc.id}`, { method: 'POST' });
			if (!res.ok) {
				const msg = await res.text().catch(() => '');
				throw new Error(msg || i18n.t('docs.summaryFailed'));
			}
			const data = await res.json();
			summaries = { ...summaries, [doc.id]: data.summary ?? '' };
		} catch (e: any) {
			summaryError = { ...summaryError, [doc.id]: e?.message ?? i18n.t('docs.summaryFailed') };
		} finally {
			summaryLoading = { ...summaryLoading, [doc.id]: false };
		}
	}

	function toggleSummary(doc: Doc) {
		if (summaryOpen[doc.id]) {
			summaryOpen = { ...summaryOpen, [doc.id]: false };
		} else {
			summarize(doc);
		}
	}

	async function load() {
		loading = true;
		error = '';
		try {
			const res = await fetch('/api/docs');
			if (!res.ok) throw new Error(i18n.t('docs.loadFailed'));
			const data = await res.json();
			docs = data.docs ?? [];
		} catch (e: any) {
			error = e?.message ?? i18n.t('docs.unknownError');
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		load();
	});

	async function uploadFiles(files: FileList | File[]) {
		const list = Array.from(files);
		if (!list.length) return;
		uploading = true;
		error = '';
		try {
			for (const file of list) {
				const fd = new FormData();
				fd.append('file', file);
				const res = await fetch('/api/docs', { method: 'POST', body: fd });
				if (!res.ok) {
					const msg = await res.text().catch(() => '');
					throw new Error(msg || `${i18n.t('docs.uploadFailed')}: ${file.name}`);
				}
			}
			await load();
		} catch (e: any) {
			error = e?.message ?? i18n.t('docs.uploadFailed');
		} finally {
			uploading = false;
		}
	}

	function onPick(e: Event) {
		const input = e.target as HTMLInputElement;
		if (input.files?.length) uploadFiles(input.files);
		input.value = '';
	}

	function onDrop(e: DragEvent) {
		e.preventDefault();
		dragOver = false;
		if (e.dataTransfer?.files?.length) uploadFiles(e.dataTransfer.files);
	}

	function download(doc: Doc) {
		window.location.href = `/api/docs?download=${doc.id}`;
	}

	async function confirmDelete() {
		if (!toDelete) return;
		const target = toDelete;
		toDelete = null;
		error = '';
		try {
			const res = await fetch(`/api/docs?id=${target.id}`, { method: 'DELETE' });
			if (!res.ok) throw new Error(i18n.t('docs.deleteFailed'));
			await load();
		} catch (e: any) {
			error = e?.message ?? i18n.t('docs.deleteFailed');
		}
	}

	function humanSize(bytes: number): string {
		if (bytes < 1024) return `${bytes} B`;
		const units = ['KB', 'MB', 'GB'];
		let val = bytes / 1024;
		let i = 0;
		while (val >= 1024 && i < units.length - 1) {
			val /= 1024;
			i++;
		}
		return `${val.toFixed(val >= 10 ? 0 : 1)} ${units[i]}`;
	}

	function humanDate(iso: string): string {
		try {
			return new Date(iso).toLocaleDateString('de-DE', {
				day: '2-digit',
				month: 'short',
				year: 'numeric',
				hour: '2-digit',
				minute: '2-digit'
			});
		} catch {
			return iso;
		}
	}

	// Inline SVG path-data per coarse type. 24×24, stroke-based.
	function iconFor(doc: Doc): string {
		const t = doc.type;
		if (t.startsWith('image/'))
			return 'M4 5h16v14H4zM4 15l4-4 4 4 3-3 5 5M9 9.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0z';
		if (t === 'application/pdf')
			return 'M7 3h7l4 4v14H7zM14 3v4h4M10 12h1.5a1.5 1.5 0 0 1 0 3H10zM10 18v-6';
		if (t.startsWith('text/') || t === 'application/json')
			return 'M6 3h9l4 4v14H6zM15 3v4h4M9 12h7M9 15.5h7M9 8.5h3';
		if (t.includes('zip') || t.includes('compressed'))
			return 'M6 3h12v18H6zM12 3v3M12 8v2M12 12v2M11 16h2v3h-2z';
		return 'M6 3h9l4 4v14H6zM15 3v4h4';
	}
</script>

<AppHeader title={i18n.t('docs.title')} eyebrow={i18n.t('docs.eyebrow')} />

<div class="wrap">
	<!-- Dropzone: Klick oder Drag & Drop -->
	<div
		class="dropzone"
		class:over={dragOver}
		class:busy={uploading}
		role="button"
		tabindex="0"
		onclick={() => fileInput.click()}
		onkeydown={(e) => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				fileInput.click();
			}
		}}
		ondragover={(e) => {
			e.preventDefault();
			dragOver = true;
		}}
		ondragleave={() => (dragOver = false)}
		ondrop={onDrop}
	>
		<div class="dz-ico">
			<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
				<path d="M12 16V4M7 9l5-5 5 5" />
				<path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
			</svg>
		</div>
		<div class="dz-text">
			<strong>{uploading ? i18n.t('docs.uploading') : i18n.t('docs.dropHint')}</strong>
			<span>{i18n.t('docs.dropSub')}</span>
		</div>
		<input
			bind:this={fileInput}
			type="file"
			multiple
			onchange={onPick}
			hidden
		/>
	</div>

	<!-- Volltextsuche -->
	<form class="search" onsubmit={(e) => { e.preventDefault(); runSearch(); }}>
		<svg class="search-ico" viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
			<circle cx="11" cy="11" r="7" />
			<path d="M21 21l-4.3-4.3" />
		</svg>
		<input
			class="search-input"
			type="search"
			placeholder={i18n.t('docs.searchPlaceholder')}
			bind:value={query}
			oninput={() => { if (!query.trim()) hits = null; }}
		/>
		{#if query.trim()}
			<button type="button" class="search-clear" onclick={clearSearch} aria-label={i18n.t('docs.clearSearch')}>×</button>
		{/if}
		<button type="submit" class="btn primary search-btn" disabled={searching || !query.trim()}>
			{searching ? i18n.t('docs.searching') : i18n.t('docs.search')}
		</button>
	</form>

	{#if error}
		<div class="msg bad">{error}</div>
	{/if}

	{#if hits !== null}
		<!-- Suchergebnisse -->
		{@const matches = hits.filter((h) => h.matched)}
		{@const skipped = hits.filter((h) => !h.searchable)}
		<div class="count">
			{matches.length} {i18n.t('docs.hits')}
			{#if skipped.length > 0} · {skipped.length} {i18n.t('docs.notSearchable')}{/if}
		</div>
		{#if matches.length === 0}
			<p class="state-line">{i18n.t('docs.noHits')} „{query}".</p>
		{:else}
			<ul class="list">
				{#each matches as hit (hit.id)}
					<li class="row hit-row">
						<div class="ico">
							<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
								<path d="M6 3h9l4 4v14H6zM15 3v4h4M9 12h7M9 15.5h7M9 8.5h3" />
							</svg>
						</div>
						<div class="meta">
							<span class="name" title={hit.name}>{hit.name}</span>
							<span class="snippet">{hit.snippet}</span>
						</div>
					</li>
				{/each}
			</ul>
		{/if}
		{#if skipped.length > 0}
			<p class="state-line hint">{i18n.t('docs.skippedBinary')} {skipped.map((s) => s.name).join(', ')}</p>
		{/if}
	{/if}

	{#if loading}
		<p class="state-line">{i18n.t('docs.loadingDocs')}</p>
	{:else if docs.length === 0}
		<!-- Leerer Zustand -->
		<div class="empty">
			<div class="empty-ico">
				<svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
					<path d="M6 3h9l4 4v14H6zM15 3v4h4M9 13h6M9 16.5h6" />
				</svg>
			</div>
			<h2>{i18n.t('docs.noDocs')}</h2>
			<p>{i18n.t('docs.noDocsHint')}</p>
			<button class="btn primary" onclick={() => fileInput.click()}>{i18n.t('docs.uploadFirst')}</button>
		</div>
	{:else}
		<div class="count">{docs.length} {docs.length === 1 ? i18n.t('docs.document') : i18n.t('docs.documents')}</div>
		<ul class="list">
			{#each docs as doc (doc.id)}
				<li class="row-wrap">
					<div class="row">
						<div class="ico">
							<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
								<path d={iconFor(doc)} />
							</svg>
						</div>
						<div class="meta">
							<span class="name" title={doc.name}>{doc.name}</span>
							<span class="sub">{humanSize(doc.size)} · {humanDate(doc.uploadedAt)}</span>
						</div>
						<div class="actions">
							{#if isTextDoc(doc)}
								<button
									class="btn ghost"
									class:active={summaryOpen[doc.id]}
									title={i18n.t('docs.aiSummary')}
									onclick={() => toggleSummary(doc)}
								>
									<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
										<path d="M12 3l1.8 4.2L18 9l-4.2 1.8L12 15l-1.8-4.2L6 9l4.2-1.8zM18 14l.9 2.1L21 17l-2.1.9L18 20l-.9-2.1L15 17l2.1-.9z" />
									</svg>
									<span class="btn-label">{i18n.lang === 'de' ? 'KI' : 'AI'}</span>
								</button>
							{/if}
							<button class="btn ghost" title={i18n.t('docs.download')} onclick={() => download(doc)} aria-label={i18n.t('docs.download')}>
								<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
									<path d="M12 4v11M8 11l4 4 4-4M5 19h14" />
								</svg>
							</button>
							<button class="btn ghost danger" title={i18n.t('docs.delete')} onclick={() => (toDelete = doc)} aria-label={i18n.t('docs.delete')}>
								<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
									<path d="M5 7h14M10 7V5h4v2M7 7l1 13h8l1-13" />
								</svg>
							</button>
						</div>
					</div>
					{#if summaryOpen[doc.id]}
						<!-- KI-Zusammenfassung, ausklappbar -->
						<div class="summary">
							<div class="summary-head">
								<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
									<path d="M12 3l1.8 4.2L18 9l-4.2 1.8L12 15l-1.8-4.2L6 9l4.2-1.8z" />
								</svg>
								<span>{i18n.t('docs.aiSummary')}</span>
							</div>
							{#if summaryLoading[doc.id]}
								<p class="summary-state">{i18n.t('docs.summarizing')}</p>
							{:else if summaryError[doc.id]}
								<p class="summary-state err">{summaryError[doc.id]}</p>
							{:else}
								<p class="summary-text">{summaries[doc.id]}</p>
							{/if}
						</div>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</div>

{#if toDelete}
	<!-- Lösch-Bestätigung -->
	<div class="overlay" role="presentation" onclick={() => (toDelete = null)}>
		<div
			class="dialog"
			role="dialog"
			aria-modal="true"
			aria-label={i18n.t('docs.deleteDoc')}
			tabindex="-1"
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => {
				if (e.key === 'Escape') toDelete = null;
			}}
		>
			<h3>{i18n.t('docs.deleteDoc')}</h3>
			<p>„{toDelete.name}" {i18n.t('docs.deleteConfirm')}</p>
			<div class="dialog-actions">
				<button class="btn ghost" onclick={() => (toDelete = null)}>{i18n.t('docs.cancel')}</button>
				<button class="btn primary danger-btn" onclick={confirmDelete}>{i18n.t('docs.delete')}</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.wrap {
		flex: 1;
		overflow-y: auto;
		padding: 24px 28px;
	}

	/* Dropzone */
	.dropzone {
		display: flex;
		align-items: center;
		gap: 16px;
		padding: 22px 24px;
		border: 1.5px dashed var(--border);
		border-radius: var(--radius-lg);
		background: var(--surface-1);
		cursor: pointer;
		transition: border-color 0.18s, background 0.18s, transform 0.18s;
		margin-bottom: 22px;
	}
	.dropzone:hover {
		border-color: var(--ember-line);
		background: var(--surface-2);
	}
	.dropzone.over {
		border-color: var(--ember-bright);
		border-style: solid;
		background: var(--ember-soft);
		transform: translateY(-1px);
	}
	.dropzone.busy {
		opacity: 0.7;
		pointer-events: none;
	}
	.dropzone:focus-visible {
		outline: none;
		border-color: var(--ember-line);
	}
	.dz-ico {
		width: 46px;
		height: 46px;
		flex: none;
		display: grid;
		place-items: center;
		border-radius: 12px;
		color: var(--ember-bright);
		background: var(--ember-soft);
	}
	.dropzone.over .dz-ico {
		background: var(--surface-1);
	}
	.dz-text {
		display: flex;
		flex-direction: column;
		gap: 3px;
	}
	.dz-text strong {
		font-size: 14px;
		color: var(--text);
	}
	.dz-text span {
		font-size: 12.5px;
		color: var(--text-muted);
	}

	/* Suche */
	.search {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 8px 12px;
		background: var(--surface-1);
		border: 1px solid var(--border-soft);
		border-radius: var(--radius);
		margin-bottom: 18px;
	}
	.search:focus-within {
		border-color: var(--ember-line);
	}
	.search-ico {
		flex: none;
		color: var(--text-faint);
	}
	.search-input {
		flex: 1;
		min-width: 0;
		background: transparent;
		border: none;
		outline: none;
		color: var(--text);
		font-size: 13.5px;
		font-family: var(--font-body);
	}
	.search-input::placeholder {
		color: var(--text-faint);
	}
	.search-clear {
		flex: none;
		background: transparent;
		border: none;
		color: var(--text-faint);
		font-size: 20px;
		line-height: 1;
		cursor: pointer;
		padding: 0 4px;
	}
	.search-clear:hover {
		color: var(--text);
	}
	.search-btn {
		flex: none;
		padding: 7px 14px;
	}
	.search-btn:disabled {
		opacity: 0.55;
		cursor: default;
	}

	/* Liste */
	.count {
		font-size: 12px;
		font-family: var(--font-mono);
		text-transform: uppercase;
		letter-spacing: 0.12em;
		color: var(--text-faint);
		margin: 0 0 12px 2px;
	}
	.list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.row {
		display: flex;
		align-items: center;
		gap: 14px;
		padding: 12px 14px;
		background: var(--surface-1);
		border: 1px solid var(--border-soft);
		border-radius: var(--radius);
		transition: border-color 0.16s, transform 0.16s;
	}
	.row:hover {
		border-color: var(--border);
		transform: translateY(-1px);
	}
	.ico {
		width: 38px;
		height: 38px;
		flex: none;
		display: grid;
		place-items: center;
		border-radius: 10px;
		color: var(--ember-bright);
		background: var(--ember-soft);
	}
	.meta {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.name {
		font-size: 13.5px;
		color: var(--text);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.sub {
		font-size: 11.5px;
		font-family: var(--font-mono);
		color: var(--text-faint);
	}
	.actions {
		display: flex;
		gap: 6px;
		flex: none;
	}
	.btn-label {
		font-size: 12px;
		font-weight: 600;
		letter-spacing: 0.02em;
	}

	/* Listen-Wrapper (Zeile + ausklappbare Zusammenfassung) */
	.row-wrap {
		display: flex;
		flex-direction: column;
	}
	.list .row {
		flex: 1;
	}

	/* Such-Treffer */
	.hit-row {
		align-items: flex-start;
	}
	.snippet {
		font-size: 12.5px;
		color: var(--text-muted);
		line-height: 1.5;
		word-break: break-word;
	}
	.hint {
		color: var(--text-faint);
		margin-top: 8px;
	}

	/* KI-Zusammenfassung */
	.summary {
		margin: 6px 0 2px;
		padding: 12px 14px;
		background: var(--surface-2);
		border: 1px solid var(--border-soft);
		border-left: 2px solid var(--ember);
		border-radius: var(--radius);
	}
	.summary-head {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 11px;
		font-family: var(--font-mono);
		text-transform: uppercase;
		letter-spacing: 0.1em;
		color: var(--ember-bright);
		margin-bottom: 8px;
	}
	.summary-text {
		font-size: 13px;
		color: var(--text);
		line-height: 1.6;
		margin: 0;
		white-space: pre-wrap;
		word-break: break-word;
	}
	.summary-state {
		font-size: 13px;
		color: var(--text-muted);
		margin: 0;
	}
	.summary-state.err {
		color: var(--danger);
	}
	.btn.ghost.active {
		color: var(--ember-bright);
		border-color: var(--ember-line);
	}

	/* Buttons */
	.btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 7px;
		border-radius: 9px;
		padding: 8px 13px;
		font-size: 13px;
		font-weight: 500;
		font-family: var(--font-body);
		border: 1px solid transparent;
		cursor: pointer;
		transition: all 0.16s;
	}
	.btn.primary {
		background: var(--ember);
		color: var(--bg);
	}
	.btn.primary:hover {
		background: var(--ember-bright);
	}
	.btn.ghost {
		background: transparent;
		border-color: var(--border);
		color: var(--text-muted);
		padding: 7px 9px;
	}
	.btn.ghost:hover {
		color: var(--text);
		border-color: var(--text-faint);
	}
	.btn.ghost.danger:hover {
		color: var(--danger);
		border-color: var(--danger);
	}
	.btn.danger-btn {
		background: var(--danger);
		color: var(--bg);
	}
	.btn.danger-btn:hover {
		filter: brightness(1.1);
	}

	/* Empty state */
	.empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		gap: 10px;
		padding: 48px 20px;
		border: 1px solid var(--border-soft);
		border-radius: var(--radius-lg);
		background: var(--surface-1);
	}
	.empty-ico {
		width: 64px;
		height: 64px;
		display: grid;
		place-items: center;
		border-radius: 16px;
		color: var(--ember-bright);
		background: var(--ember-soft);
		margin-bottom: 4px;
	}
	.empty h2 {
		font-size: 17px;
		color: var(--text);
		margin: 0;
	}
	.empty p {
		font-size: 13px;
		color: var(--text-muted);
		max-width: 360px;
		margin: 0 0 8px;
	}

	/* States & messages */
	.state-line {
		font-size: 13px;
		color: var(--text-muted);
	}
	.msg {
		margin: 0 0 16px;
		padding: 11px 13px;
		border-radius: 10px;
		font-size: 13px;
	}
	.msg.bad {
		background: var(--surface-2);
		color: var(--danger);
		border: 1px solid var(--danger);
	}

	/* Dialog */
	.overlay {
		position: fixed;
		inset: 0;
		background: var(--bg-veil);
		backdrop-filter: blur(3px);
		display: grid;
		place-items: center;
		padding: 20px;
		z-index: 100;
	}
	.dialog {
		width: 100%;
		max-width: 400px;
		background: var(--surface-2);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		padding: 22px;
	}
	.dialog h3 {
		font-size: 16px;
		color: var(--text);
		margin: 0 0 8px;
	}
	.dialog p {
		font-size: 13px;
		color: var(--text-muted);
		margin: 0 0 18px;
		word-break: break-word;
	}
	.dialog-actions {
		display: flex;
		justify-content: flex-end;
		gap: 10px;
	}
</style>
