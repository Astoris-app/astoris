<script lang="ts">
	import { onMount } from 'svelte';
	import AppHeader from '$lib/components/AppHeader.svelte';
	import { i18n } from '$lib/stores/i18n.svelte';

	type Urgency = 'hoch' | 'mittel' | 'niedrig' | '';
	type Call = {
		id: string;
		from: string;
		to: string;
		at: string;
		durationSec: number;
		recordingUrl: string;
		transcript: string;
		summary: string;
		urgency: Urgency;
		read: boolean;
	};

	let calls = $state<Call[]>([]);
	let loading = $state(true);
	let busy = $state(false);
	let connected = $state(true);
	let filter = $state<'all' | 'unread'>('all');
	let openId = $state<string | null>(null);

	async function load() {
		try {
			const res = await fetch('/api/calls');
			const data = await res.json();
			calls = Array.isArray(data?.calls) ? data.calls : [];
		} catch {
			calls = [];
		}
	}

	async function checkConnected() {
		try {
			const res = await fetch('/api/connections');
			const data = await res.json();
			const list = Array.isArray(data?.connections) ? data.connections : [];
			connected = list.some((c: { connectorId: string }) => c.connectorId === 'telephony');
		} catch {
			connected = true; // im Zweifel keinen Hinweis erzwingen
		}
	}

	async function act(id: string, action: 'mark-read' | 'delete') {
		if (busy) return;
		if (action === 'delete' && !confirm(i18n.t('calls.deleteConfirm'))) return;
		busy = true;
		try {
			const res = await fetch('/api/calls', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ action, id })
			});
			if (res.ok) {
				const data = await res.json();
				calls = Array.isArray(data?.calls) ? data.calls : calls;
			}
		} catch {
			/* offline ok */
		} finally {
			busy = false;
		}
	}

	function toggle(id: string) {
		openId = openId === id ? null : id;
	}

	onMount(async () => {
		await Promise.all([load(), checkConnected()]);
		loading = false;
	});

	let shown = $derived(filter === 'unread' ? calls.filter((c) => !c.read) : calls);
	let unreadCount = $derived(calls.filter((c) => !c.read).length);

	function urgencyKey(u: Urgency): string {
		if (u === 'hoch') return 'calls.urgencyHigh';
		if (u === 'niedrig') return 'calls.urgencyLow';
		return 'calls.urgencyMid';
	}
	function urgencyClass(u: Urgency): string {
		if (u === 'hoch') return 'u-high';
		if (u === 'niedrig') return 'u-low';
		return 'u-mid';
	}

	function fmtDuration(sec: number): string {
		if (!sec || sec < 1) return '0:00';
		const m = Math.floor(sec / 60);
		const s = sec % 60;
		return m + ':' + String(s).padStart(2, '0');
	}

	function fmtTime(at?: string): string {
		if (!at) return '';
		const d = new Date(at);
		if (isNaN(d.getTime())) return '';
		return d.toLocaleString(i18n.lang === 'en' ? 'en-GB' : 'de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
	}
	function relTime(at?: string): string {
		if (!at) return '';
		const d = new Date(at);
		if (isNaN(d.getTime())) return '';
		const sec = Math.round((Date.now() - d.getTime()) / 1000);
		if (sec < 45) return i18n.t('calls.relNow');
		const min = Math.round(sec / 60);
		if (min < 60) return i18n.t('calls.relMin').replace('{n}', String(min));
		const hr = Math.round(min / 60);
		if (hr < 24) return i18n.t('calls.relHr').replace('{n}', String(hr));
		const day = Math.round(hr / 24);
		if (day <= 7) return i18n.t('calls.relDay').replace('{n}', String(day));
		return fmtTime(at);
	}
	function recUrl(c: Call): string {
		if (!c.recordingUrl) return '';
		return /\.(mp3|wav)$/i.test(c.recordingUrl) ? c.recordingUrl : c.recordingUrl + '.mp3';
	}
</script>

<AppHeader title={i18n.t('calls.title')} eyebrow={i18n.t('calls.eyebrow')} />

<div class="scroll">
	<p class="lead">{i18n.t('calls.lead')}</p>

	{#if loading}
		<p class="muted">{i18n.t('calls.loading')}</p>
	{:else if calls.length === 0}
		<div class="empty">
			<span class="big">📞</span>
			<h3>{i18n.t('calls.empty')}</h3>
			<p>{i18n.t('calls.emptyHint')}</p>
			{#if !connected}
				<div class="setup">
					<strong>{i18n.t('calls.setupTitle')}</strong>
					<span>{i18n.t('calls.setupHint')}</span>
				</div>
			{/if}
		</div>
	{:else}
		<div class="filters">
			<button class="fbtn" class:active={filter === 'all'} onclick={() => (filter = 'all')}>{i18n.t('calls.filterAll')}</button>
			<button class="fbtn" class:active={filter === 'unread'} onclick={() => (filter = 'unread')}>
				{i18n.t('calls.filterUnread')}{#if unreadCount > 0}<span class="cnt">{unreadCount}</span>{/if}
			</button>
		</div>

		{#if shown.length === 0}
			<p class="muted">{i18n.t('calls.empty')}</p>
		{:else}
			<div class="list">
				{#each shown as c (c.id)}
					<div class="card" class:unread={!c.read}>
						<div class="top">
							<div class="who">
								<span class="num">{c.from || '—'}</span>
								{#if !c.read}<span class="dot" title={i18n.t('calls.unread')}></span>{/if}
							</div>
							<span class="badge {urgencyClass(c.urgency)}">{i18n.t(urgencyKey(c.urgency))}</span>
							<span class="time" title={fmtTime(c.at)}>{relTime(c.at)}</span>
						</div>

						<p class="summary">{c.summary || '—'}</p>

						<div class="meta">
							<span>⏱ {fmtDuration(c.durationSec)}</span>
							{#if recUrl(c)}
								<a class="link" href={recUrl(c)} target="_blank" rel="noopener">🎧 {i18n.t('calls.listen')}</a>
							{/if}
							<button class="link asbtn" onclick={() => toggle(c.id)}>
								{openId === c.id ? i18n.t('calls.hideTranscript') : i18n.t('calls.showTranscript')}
							</button>
						</div>

						{#if openId === c.id}
							<div class="transcript">
								<span class="tlabel">{i18n.t('calls.transcript')}</span>
								{#if c.transcript?.trim()}
									<p>{c.transcript}</p>
								{:else}
									<p class="muted">{i18n.t('calls.noTranscript')}</p>
								{/if}
							</div>
						{/if}

						<div class="actions">
							{#if !c.read}
								<button class="abtn" onclick={() => act(c.id, 'mark-read')} disabled={busy}>{i18n.t('calls.markRead')}</button>
							{/if}
							<button class="abtn danger" onclick={() => act(c.id, 'delete')} disabled={busy}>{i18n.t('calls.delete')}</button>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	{/if}
</div>

<style>
	.scroll { flex: 1; overflow-y: auto; padding: 24px 28px 48px; }
	.muted { color: var(--text-faint); }
	.lead { color: var(--text-muted); max-width: 640px; margin: 0 0 20px; }

	/* Empty state */
	.empty { text-align: center; padding: 56px 20px; background: var(--surface-1); border: 1px dashed var(--border); border-radius: var(--radius-lg); display: flex; flex-direction: column; align-items: center; gap: 8px; }
	.empty .big { font-size: 38px; }
	.empty h3 { font-size: 16px; }
	.empty p { margin: 0; color: var(--text-muted); font-size: 13.5px; max-width: 460px; }
	.setup { margin-top: 14px; display: flex; flex-direction: column; gap: 4px; padding: 12px 16px; background: var(--ember-soft); border: 1px solid var(--ember-line); border-radius: var(--radius-sm); max-width: 460px; }
	.setup strong { font-size: 13px; color: var(--ember-bright); }
	.setup span { font-size: 12.5px; color: var(--text-muted); }

	/* Filters */
	.filters { display: flex; flex-wrap: wrap; gap: 7px; margin-bottom: 16px; }
	.fbtn { display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; color: var(--text-muted); background: var(--surface-1); border: 1px solid var(--border-soft); border-radius: 8px; padding: 6px 13px; transition: all 0.14s; }
	.fbtn:hover { color: var(--text); border-color: var(--border); }
	.fbtn.active { color: var(--ember-bright); border-color: var(--ember-line); background: var(--ember-soft); }
	.cnt { font-size: 10.5px; font-family: var(--font-mono); background: var(--ember); color: #fff; border-radius: 999px; padding: 1px 6px; }

	/* Cards */
	.list { display: flex; flex-direction: column; gap: 10px; }
	.card { background: var(--surface-1); border: 1px solid var(--border-soft); border-left-width: 3px; border-left-color: var(--border); border-radius: var(--radius-sm); padding: 14px 16px; display: flex; flex-direction: column; gap: 9px; }
	.card.unread { border-left-color: var(--ember); background: var(--surface-2); }

	.top { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
	.who { display: flex; align-items: center; gap: 8px; min-width: 0; }
	.num { font-size: 14.5px; font-weight: 600; color: var(--text); font-family: var(--font-mono); }
	.dot { width: 8px; height: 8px; border-radius: 999px; background: var(--ember); flex: none; }
	.time { margin-left: auto; font-size: 11px; color: var(--text-faint); font-family: var(--font-mono); white-space: nowrap; }

	.badge { font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; font-family: var(--font-mono); padding: 3px 9px; border-radius: 999px; border: 1px solid var(--border-soft); white-space: nowrap; }
	.badge.u-high { color: var(--danger); border-color: var(--danger-soft); background: var(--danger-soft); }
	.badge.u-mid { color: var(--ember-bright); border-color: var(--ember-line); background: var(--ember-soft); }
	.badge.u-low { color: var(--sage); border-color: var(--border-soft); }

	.summary { margin: 0; font-size: 13.5px; color: var(--text); line-height: 1.5; word-break: break-word; }

	.meta { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; font-size: 12px; color: var(--text-muted); }
	.link { color: var(--text-muted); text-decoration: none; border-bottom: 1px dotted var(--border); }
	.link:hover { color: var(--ember-bright); }
	.asbtn { background: none; border: none; border-bottom: 1px dotted var(--border); padding: 0; cursor: pointer; font-size: 12px; }

	.transcript { background: var(--surface-2); border: 1px solid var(--border-soft); border-radius: var(--radius-sm); padding: 11px 14px; }
	.tlabel { font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-faint); font-family: var(--font-mono); }
	.transcript p { margin: 6px 0 0; font-size: 13px; color: var(--text); line-height: 1.55; white-space: pre-wrap; word-break: break-word; }

	.actions { display: flex; gap: 8px; flex-wrap: wrap; }
	.abtn { font-size: 12px; color: var(--text-muted); background: transparent; border: 1px solid var(--border-soft); border-radius: 8px; padding: 5px 12px; transition: all 0.14s; }
	.abtn:not(:disabled):hover { color: var(--text); border-color: var(--border); }
	.abtn.danger:not(:disabled):hover { color: var(--danger); border-color: var(--danger-soft); background: var(--danger-soft); }
	.abtn:disabled { opacity: 0.45; cursor: not-allowed; }

	@media (max-width: 640px) {
		.scroll { padding: 20px 16px 40px; }
		.time { margin-left: 0; width: 100%; }
	}
</style>
