<script lang="ts">
	import { onMount } from 'svelte';
	import AppHeader from '$lib/components/AppHeader.svelte';

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

	async function openMail(m: Mail) {
		selected = m;
		bodyError = null;
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
			bodyError = 'Nachrichtentext konnte nicht geladen werden.';
		} finally {
			bodyLoading = false;
		}
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
			error = 'Postfach konnte nicht geladen werden.';
			mails = [];
		} finally {
			loading = false;
		}
	}
	onMount(load);

	const unreadCount = $derived(mails.filter((m) => !m.seen).length);

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

<AppHeader title="Posteingang" eyebrow="E-Mail-Triage durch die KI">
	{#if connected}
		<button class="refresh" onclick={load} disabled={loading} title="Aktualisieren" aria-label="Aktualisieren">
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
			<p class="muted">Postfach wird geladen …</p>
		</div>
	{:else if !connected}
		<div class="state empty">
			<div class="ico">
				<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
					<rect x="3" y="5" width="18" height="14" rx="2" />
					<path d="M3.5 6.5 12 13l8.5-6.5" />
				</svg>
			</div>
			<h2>Noch kein Postfach verbunden</h2>
			<p class="muted">Verbinde dein E-Mail-Konto unter Verbindungen, damit die KI deinen Posteingang lesen und zusammenfassen kann.</p>
			<a class="btn primary" href="/connections">Zu den Verbindungen</a>
		</div>
	{:else if error}
		<div class="state empty">
			<div class="ico warn">
				<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
					<path d="M12 9v4M12 17h.01" />
					<path d="M10.3 3.86 1.82 18a2 2 0 0 0 1.7 3h16.96a2 2 0 0 0 1.7-3L13.7 3.86a2 2 0 0 0-3.4 0Z" />
				</svg>
			</div>
			<h2>Postfach nicht erreichbar</h2>
			<p class="muted">{error}</p>
			<button class="btn ghost" onclick={load}>Erneut versuchen</button>
		</div>
	{:else if !mails.length}
		<div class="state empty">
			<div class="ico">
				<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
					<rect x="3" y="5" width="18" height="14" rx="2" />
					<path d="M3.5 6.5 12 13l8.5-6.5" />
				</svg>
			</div>
			<h2>Posteingang leer</h2>
			<p class="muted">Hier erscheinen deine neuesten Nachrichten.</p>
		</div>
	{:else}
		<div class="layout" class:has-detail={!!selected}>
			<ul class="list">
				<li class="meta mono">{mails.length} Nachrichten · {unreadCount} ungelesen</li>
				{#each mails as m (m.uid)}
					<li>
						<button
							class="row"
							class:unread={!m.seen}
							class:active={selected?.uid === m.uid}
							onclick={() => openMail(m)}
						>
							{#if !m.seen}<span class="dot" aria-label="ungelesen"></span>{/if}
							<span class="from">{displayName(m.from)}</span>
							<span class="subject">{m.subject}</span>
							<span class="date mono">{fmtDate(m.date)}</span>
						</button>
					</li>
				{/each}
			</ul>

			{#if selected}
				<aside class="detail">
					<button class="close" onclick={() => (selected = null)} aria-label="Schließen">
						<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
					</button>
					<h2 class="dsubject">{selected.subject}</h2>
					<div class="dmeta">
						<div><span class="lbl mono">Von</span><span>{selected.from}</span></div>
						<div><span class="lbl mono">Datum</span><span>{fmtDate(selected.date)}</span></div>
						<div><span class="lbl mono">Status</span><span>{selected.seen ? 'Gelesen' : 'Ungelesen'}</span></div>
					</div>
					<div class="dbody">
						{#if bodyLoading}
							<div class="bodystate">
								<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" class="spin">
									<path d="M21 12a9 9 0 1 1-2.64-6.36" />
									<path d="M21 4v5h-5" />
								</svg>
								<span class="muted">Nachrichtentext wird geladen …</span>
							</div>
						{:else if bodyError}
							<div class="bodystate">
								<span class="muted">{bodyError}</span>
								<button class="btn ghost" onclick={() => selected && openMail(selected)}>Erneut versuchen</button>
							</div>
						{:else if bodyCache[selected.uid] !== undefined}
							<pre class="bodytext">{bodyCache[selected.uid]}</pre>
						{:else}
							<p class="muted">Kein Nachrichtentext verfügbar.</p>
						{/if}
					</div>
				</aside>
			{/if}
		</div>
	{/if}
</div>

<style>
	.scroll { flex: 1; overflow-y: auto; padding: 24px 28px; }

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
		font-family: var(--font-mono);
		font-size: 12.5px;
		line-height: 1.6;
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
