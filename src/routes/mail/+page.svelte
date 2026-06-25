<script lang="ts">
	import { onMount } from 'svelte';
	import AppHeader from '$lib/components/AppHeader.svelte';
	import { i18n } from '$lib/stores/i18n.svelte';

	type Mail = { uid: number; from: string; subject: string; date: string; seen: boolean };

	let connected = $state(false);
	let mails = $state<Mail[]>([]);
	let error = $state<string | null>(null);
	let loading = $state(true);
	let selected = $state<Mail | null>(null);

	// Body cache + loading/error state for the currently opened message.
	let bodyCache = $state<Record<number, string>>({});
	let bodyLoading = $state(false);
	let bodyError = $state<string | null>(null);
	let aiResult = $state('');
	let aiLoading = $state(false);
	let aiError = $state('');
	let aiAction = $state('');
	let aiCopied = $state(false);
	let replyOpen = $state(false);
	let replyTo = $state('');
	let replySubject = $state('');
	let replyBody = $state('');
	let sending = $state(false);
	let sendMsg = $state('');
	let sendOk = $state(false);

	async function openMail(m: Mail) {
		selected = m;
		bodyError = null;
		aiResult = ''; aiError = ''; aiAction = ''; aiCopied = false;
		replyOpen = false; sendMsg = '';
		if (bodyCache[m.uid] !== undefined) return;
		bodyLoading = true;
		try {
			const res = await fetch(`/api/mail?uid=${m.uid}`);
			const data = await res.json();
			if (data.error) {
				bodyError = data.error;
			} else {
				bodyCache = { ...bodyCache, [m.uid]: data.body ?? '' };
			}
		} catch {
			bodyError = i18n.t('mail.bodyError');
		} finally {
			bodyLoading = false;
		}
	}

	async function runAi(action: string) {
		if (!selected) return;
		const body = bodyCache[selected.uid];
		if (!body) return;
		aiLoading = true; aiError = ''; aiResult = ''; aiAction = action; aiCopied = false;
		try {
			const res = await fetch('/api/mail/ai', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action, body, subject: selected.subject, from: selected.from }) });
			const d = await res.json().catch(() => ({}));
			if (!res.ok) aiError = d.message ?? i18n.t('mail.aiFailed');
			else aiResult = d.result ?? '';
		} catch { aiError = i18n.t('mail.aiFailed'); }
		aiLoading = false;
	}
	async function copyAi() {
		try { await navigator.clipboard.writeText(aiResult); aiCopied = true; setTimeout(() => (aiCopied = false), 1500); } catch { /* ignore */ }
	}
	function openReply() {
		if (!selected) return;
		replyTo = selected.from.match(/<(.+?)>/)?.[1] ?? selected.from;
		replySubject = selected.subject.startsWith('Re:') ? selected.subject : 'Re: ' + selected.subject;
		replyBody = aiResult || '';
		sendMsg = ''; sendOk = false;
		replyOpen = true;
	}
	async function sendReply() {
		if (!replyTo.trim() || !replyBody.trim()) return;
		sending = true; sendMsg = ''; sendOk = false;
		try {
			const res = await fetch('/api/mail/send', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ to: replyTo, subject: replySubject, text: replyBody }) });
			const d = await res.json().catch(() => ({}));
			if (!res.ok) { sendMsg = d.message ?? i18n.t('mail.sendFailed'); }
			else { sendOk = true; sendMsg = i18n.t('mail.sent'); setTimeout(() => (replyOpen = false), 1200); }
		} catch { sendMsg = i18n.t('mail.sendFailed'); }
		sending = false;
	}
	async function load() {
		loading = true;
		error = null;
		try {
			const res = await fetch('/api/mail');
			const data = await res.json();
			connected = Boolean(data.connected);
			mails = Array.isArray(data.mails) ? data.mails : [];
			error = data.error ?? null;
			// Keep selection valid after refresh.
			if (selected && !mails.some((m) => m.uid === selected!.uid)) selected = null;
		} catch {
			error = i18n.t('mail.mailboxFailed');
			mails = [];
		} finally {
			loading = false;
		}
	}
	onMount(load);
	onMount(() => { try { const v = localStorage.getItem('astoris-mail-stars'); if (v) stars = new Set(JSON.parse(v)); } catch { /* ignore */ } });

	const unreadCount = $derived(mails.filter((m) => !m.seen).length);
	let tab = $state<'all' | 'unread' | 'starred'>('all');
	let stars = $state<Set<number>>(new Set());
	const filtered = $derived(
		tab === 'unread' ? mails.filter((m) => !m.seen)
		: tab === 'starred' ? mails.filter((m) => stars.has(m.uid))
		: mails
	);
	function toggleStar(uid: number) {
		const next = new Set(stars);
		if (next.has(uid)) next.delete(uid); else next.add(uid);
		stars = next;
		try { localStorage.setItem('astoris-mail-stars', JSON.stringify([...next])); } catch { /* ignore */ }
	}

	// Extract a readable display name from a "Name <addr>" From header.
	function displayName(from: string): string {
		const m = from.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
		if (m && m[1].trim()) return m[1].trim();
		if (m) return m[2].trim();
		return from.trim();
	}

	function fmtDate(raw: string): string {
		if (!raw) return '';
		const d = new Date(raw);
		if (isNaN(d.getTime())) return raw;
		const now = new Date();
		const sameDay = d.toDateString() === now.toDateString();
		if (sameDay) return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
		const sameYear = d.getFullYear() === now.getFullYear();
		return d.toLocaleDateString('de-DE', { day: '2-digit', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) });
	}
</script>

<AppHeader title={i18n.t('mail.title')} eyebrow={i18n.t('mail.eyebrow')}>
	{#if connected}
		<button class="refresh" onclick={load} disabled={loading} title={i18n.t('mail.refresh')} aria-label={i18n.t('mail.refresh')}>
			<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" class:spin={loading}>
				<path d="M21 12a9 9 0 1 1-2.64-6.36" />
				<path d="M21 4v5h-5" />
			</svg>
		</button>
	{/if}
</AppHeader>

<div class="scroll">
	{#if loading && !mails.length}
		<div class="state">
			<p class="muted">{i18n.t('mail.loadingMailbox')}</p>
		</div>
	{:else if !connected}
		<div class="state empty">
			<div class="ico">
				<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
					<rect x="3" y="5" width="18" height="14" rx="2" />
					<path d="M3.5 6.5 12 13l8.5-6.5" />
				</svg>
			</div>
			<h2>{i18n.t('mail.noMailbox')}</h2>
			<p class="muted">{i18n.t('mail.noMailboxHint')}</p>
			<a class="btn primary" href="/connections">{i18n.t('mail.toConnections')}</a>
		</div>
	{:else if error}
		<div class="state empty">
			<div class="ico warn">
				<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
					<path d="M12 9v4M12 17h.01" />
					<path d="M10.3 3.86 1.82 18a2 2 0 0 0 1.7 3h16.96a2 2 0 0 0 1.7-3L13.7 3.86a2 2 0 0 0-3.4 0Z" />
				</svg>
			</div>
			<h2>{i18n.t('mail.unreachable')}</h2>
			<p class="muted">{error}</p>
			<button class="btn ghost" onclick={load}>{i18n.t('mail.retry')}</button>
		</div>
	{:else if !mails.length}
		<div class="state empty">
			<div class="ico">
				<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
					<rect x="3" y="5" width="18" height="14" rx="2" />
					<path d="M3.5 6.5 12 13l8.5-6.5" />
				</svg>
			</div>
			<h2>{i18n.t('mail.empty')}</h2>
			<p class="muted">{i18n.t('mail.emptyHint')}</p>
		</div>
	{:else}
		<div class="layout" class:has-detail={!!selected}>
			<div class="mtabs">
				<button class:sel={tab === 'all'} onclick={() => (tab = 'all')}>{i18n.t('mail.filterAll')}</button>
				<button class:sel={tab === 'unread'} onclick={() => (tab = 'unread')}>{i18n.t('mail.filterUnread')}{#if unreadCount} ({unreadCount}){/if}</button>
				<button class:sel={tab === 'starred'} onclick={() => (tab = 'starred')}>{i18n.t('mail.filterStarred')}</button>
			</div>
			<ul class="list">
				{#if filtered.length === 0}
					<li class="meta mono">{i18n.t('mail.noneInFilter')}</li>
				{/if}
				{#each filtered as m (m.uid)}
					<li class="mrow">
						<button class="row" class:unread={!m.seen} class:active={selected?.uid === m.uid} onclick={() => openMail(m)}>
							{#if !m.seen}<span class="dot" aria-label={i18n.t('mail.unread')}></span>{/if}
							<span class="from">{displayName(m.from)}</span>
							<span class="subject">{m.subject}</span>
							<span class="date mono">{fmtDate(m.date)}</span>
						</button>
						<button class="star" class:on={stars.has(m.uid)} onclick={() => toggleStar(m.uid)} aria-label="Favorit" title="Favorit">
							<svg width="15" height="15" viewBox="0 0 24 24" fill={stars.has(m.uid) ? 'currentColor' : 'none'} stroke="currentColor" stroke-width="1.5"><path d="M12 2l3 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.9 21l1.2-6.8-5-4.9 6.9-1z"/></svg>
						</button>
					</li>
				{/each}
			</ul>

			{#if selected}
				<aside class="detail">
					<button class="close" onclick={() => (selected = null)} aria-label={i18n.t('mail.close')}>
						<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
					</button>
					<h2 class="dsubject">{selected.subject}</h2>
					<div class="dmeta">
						<div><span class="lbl mono">{i18n.t('mail.from')}</span><span>{selected.from}</span></div>
						<div><span class="lbl mono">{i18n.t('mail.date')}</span><span>{fmtDate(selected.date)}</span></div>
						<div><span class="lbl mono">{i18n.t('mail.status')}</span><span>{selected.seen ? i18n.t('mail.read') : i18n.t('mail.unreadStatus')}</span></div>
					</div>
					<div class="dbody">
						{#if bodyLoading}
							<div class="bodystate">
								<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" class="spin">
									<path d="M21 12a9 9 0 1 1-2.64-6.36" />
									<path d="M21 4v5h-5" />
								</svg>
								<span class="muted">{i18n.t('mail.bodyLoading')}</span>
							</div>
						{:else if bodyError}
							<div class="bodystate">
								<span class="muted">{bodyError}</span>
								<button class="btn ghost" onclick={() => selected && openMail(selected)}>{i18n.t('mail.retry')}</button>
							</div>
						{:else if bodyCache[selected.uid] !== undefined}
							<pre class="bodytext">{bodyCache[selected.uid]}</pre>
						{:else}
							<p class="muted">{i18n.t('mail.noBody')}</p>
						{/if}
						{#if bodyCache[selected.uid]}
							<div class="aiacts">
								<button class="btn" onclick={() => runAi('summarize')} disabled={aiLoading}>{i18n.t('mail.summarize')}</button>
								<button class="btn" onclick={() => runAi('reply-draft')} disabled={aiLoading}>{i18n.t('mail.replyDraft')}</button>
								<button class="btn" onclick={openReply} disabled={aiLoading}>{i18n.t('mail.reply')}</button>
							</div>
							{#if aiLoading}<div class="aibox muted">{i18n.t('mail.aiThinking')}</div>{/if}
							{#if aiError}<div class="aibox err">{aiError}</div>{/if}
							{#if aiResult}
								<div class="aibox">
									<div class="aihead">{aiAction === 'summarize' ? i18n.t('mail.summary') : i18n.t('mail.draft')}<button class="copy" onclick={copyAi}>{aiCopied ? i18n.t('mail.copied') : i18n.t('mail.copy')}</button></div>
									<div class="aitext">{aiResult}</div>
								</div>
							{/if}
						{/if}
					</div>
				</aside>
			{/if}
		</div>
							{#if replyOpen}
								<div class="reply">
									<label><span>{i18n.t('mail.replyTo')}</span><input bind:value={replyTo} /></label>
									<label><span>{i18n.t('mail.replySubject')}</span><input bind:value={replySubject} /></label>
									<label><span>{i18n.t('mail.replyBody')}</span><textarea bind:value={replyBody} rows="6"></textarea></label>
									{#if sendMsg}<div class="sendmsg" class:ok={sendOk}>{sendMsg}</div>{/if}
									<div class="replyacts">
										<button class="btn ghost" onclick={() => (replyOpen = false)}>{i18n.t('mail.cancel')}</button>
										<button class="btn primary" onclick={sendReply} disabled={sending}>{sending ? i18n.t('mail.sending') : i18n.t('mail.sendReply')}</button>
									</div>
								</div>
							{/if}
	{/if}
</div>

<style>
	.scroll { flex: 1; overflow-y: auto; padding: 24px 28px; }
	.mtabs { display: flex; gap: 4px; margin-bottom: 12px; grid-column: 1 / -1; }
	.mtabs button { font-size: 12.5px; color: var(--text-muted); background: transparent; border: 1px solid var(--border-soft); border-radius: 999px; padding: 5px 13px; transition: all 0.15s; }
	.mtabs button:hover { color: var(--text); }
	.mtabs button.sel { color: var(--ember-bright); background: var(--ember-soft); border-color: var(--ember-line); }
	.mrow { display: flex; align-items: stretch; }
	.mrow .row { flex: 1; }
	.star { flex: none; width: 38px; display: grid; place-items: center; border: none; background: transparent; color: var(--text-faint); transition: color 0.15s; }
	.star:hover { color: var(--ember-bright); }
	.star.on { color: var(--ember); }
	.aiacts { display: flex; gap: 8px; margin-top: 16px; flex-wrap: wrap; }
	.aibox { margin-top: 12px; background: var(--surface-2); border: 1px solid var(--border-soft); border-radius: var(--radius); padding: 13px 15px; font-size: 13.5px; line-height: 1.6; }
	.aibox.err { background: var(--danger-soft); color: var(--danger); }
	.aibox.muted { color: var(--text-muted); }
	.aihead { display: flex; align-items: center; justify-content: space-between; font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--ember-bright); margin-bottom: 8px; }
	.aihead .copy { font-size: 11px; text-transform: none; letter-spacing: 0; color: var(--text-faint); background: transparent; border: none; }
	.aihead .copy:hover { color: var(--text); }
	.aitext { white-space: pre-wrap; color: var(--text); }
	.reply { margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--border-soft); display: flex; flex-direction: column; gap: 10px; }
	.reply label { display: flex; flex-direction: column; gap: 5px; }
	.reply label span { font-size: 11.5px; color: var(--text-muted); }
	.reply input, .reply textarea { background: var(--surface-1); border: 1px solid var(--border); border-radius: 9px; padding: 9px 12px; color: var(--text); font: inherit; font-size: 13.5px; }
	.reply textarea { resize: vertical; }
	.reply input:focus, .reply textarea:focus { outline: none; border-color: var(--ember-line); }
	.sendmsg { font-size: 12.5px; color: var(--danger); }
	.sendmsg.ok { color: var(--sage); }
	.replyacts { display: flex; justify-content: flex-end; gap: 10px; }
	.btn.primary { background: var(--ember); color: #1a1206; border: none; }
	.btn.primary:not(:disabled):hover { background: var(--ember-bright); }

	.refresh {
		display: grid; place-items: center;
		width: 32px; height: 32px;
		border-radius: 999px;
		border: 1px solid var(--border-soft);
		background: var(--surface-1);
		color: var(--text-muted);
		transition: color 0.16s, border-color 0.16s;
	}
	.refresh:not(:disabled):hover { color: var(--text); border-color: var(--text-faint); }
	.refresh:disabled { opacity: 0.6; cursor: default; }
	.spin { animation: spin 0.9s linear infinite; }
	@keyframes spin { to { transform: rotate(360deg); } }

	.state { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 60%; text-align: center; gap: 4px; }
	.state.empty { gap: 10px; padding: 40px 20px; }
	.state .ico { width: 72px; height: 72px; display: grid; place-items: center; border-radius: 18px; color: var(--ember-bright); background: var(--ember-soft); margin-bottom: 8px; }
	.state .ico.warn { color: var(--danger); background: var(--danger-soft); }
	.state h2 { font-size: 17px; }
	.muted { color: var(--text-muted); max-width: 420px; margin: 0; font-size: 13.5px; line-height: 1.5; }

	.layout { display: grid; grid-template-columns: 1fr; gap: 16px; }
	.layout.has-detail { grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr); }

	.list { list-style: none; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
	.meta { font-size: 11px; color: var(--text-faint); text-transform: uppercase; letter-spacing: 0.1em; padding: 0 4px 10px; }

	.row {
		width: 100%;
		display: grid;
		grid-template-columns: auto minmax(110px, 0.7fr) minmax(0, 1.6fr) auto;
		align-items: center;
		gap: 12px;
		padding: 12px 14px;
		border-radius: var(--radius-sm);
		border: 1px solid transparent;
		background: var(--surface-1);
		text-align: left;
		transition: border-color 0.14s, background 0.14s;
	}
	.row:hover { border-color: var(--border); }
	.row.active { border-color: var(--ember-line); background: var(--surface-2); }
	.row.unread { background: var(--surface-2); }

	.dot { width: 7px; height: 7px; border-radius: 50%; background: var(--ember-bright); }
	/* Reserve the dot column even when read, so columns stay aligned. */
	.row:not(.unread) { grid-template-columns: 7px minmax(110px, 0.7fr) minmax(0, 1.6fr) auto; }

	.from { font-size: 13.5px; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.row.unread .from { color: var(--text); font-weight: 600; }
	.subject { font-size: 13.5px; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.row.unread .subject { font-weight: 600; }
	.date { font-size: 11.5px; color: var(--text-faint); white-space: nowrap; }

	.detail {
		position: relative;
		background: var(--surface-1);
		border: 1px solid var(--border-soft);
		border-radius: var(--radius);
		padding: 20px 22px;
		align-self: start;
		min-width: 0;
	}
	.close {
		position: absolute; top: 14px; right: 14px;
		display: grid; place-items: center;
		width: 28px; height: 28px; border-radius: 8px;
		color: var(--text-faint); transition: color 0.14s, background 0.14s;
	}
	.close:hover { color: var(--text); background: var(--surface-2); }
	.dsubject { font-size: 16px; margin: 0 32px 16px 0; line-height: 1.35; }
	.dmeta { display: flex; flex-direction: column; gap: 8px; padding-bottom: 16px; border-bottom: 1px solid var(--border-soft); }
	.dmeta > div { display: grid; grid-template-columns: 64px 1fr; gap: 10px; font-size: 13px; }
	.dmeta .lbl { color: var(--text-faint); text-transform: uppercase; letter-spacing: 0.08em; font-size: 10.5px; padding-top: 1px; }
	.dmeta span:last-child { color: var(--text); word-break: break-word; }
	.dbody { padding-top: 16px; }
	.bodystate { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
	.bodytext {
		margin: 0;
		max-height: 420px;
		overflow-y: auto;
		white-space: pre-wrap;
		word-break: break-word;
		font-family: var(--font-body);
		font-size: 14px;
		line-height: 1.65;
		color: var(--text);
	}

	.btn { border-radius: 9px; padding: 9px 15px; font-size: 13.5px; font-weight: 500; border: 1px solid transparent; transition: all 0.16s; margin-top: 6px; display: inline-block; }
	.btn.primary { background: var(--ember); color: #1a1206; }
	.btn.primary:hover { background: var(--ember-bright); }
	.btn.ghost { background: transparent; border-color: var(--border); color: var(--text-muted); }
	.btn.ghost:hover { color: var(--text); border-color: var(--text-faint); }

	@media (max-width: 760px) {
		.layout.has-detail { grid-template-columns: 1fr; }
	}
</style>
