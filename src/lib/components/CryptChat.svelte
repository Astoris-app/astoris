<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { encryptMessage, decryptMessage, isEncryptedBlock } from '$lib/crypto/messageCrypto';
	import { i18n } from '$lib/stores/i18n.svelte';

	const CHANNELS = [
		{ id: 'telegram', label: 'Telegram', icon: 'M21.5 4.3 2.5 11.6c-1 .4-1 1.8 0 2.1l4.6 1.5 1.8 5.4c.3.8 1.3 1 1.9.4l2.6-2.5 4.6 3.4c.7.5 1.7.1 1.9-.7l3.3-15.6c.2-1-.8-1.9-1.7-1.5z' },
		{ id: 'email', label: 'E-Mail', icon: 'M3.5 6.5h17v11h-17zM3.8 7l8.2 6 8.2-6' },
		{ id: 'whatsapp', label: 'WhatsApp', icon: 'M12 3a9 9 0 0 0-7.7 13.6L3 21l4.5-1.2A9 9 0 1 0 12 3zM8.5 8c.2 0 .5.5.8 1.2.1.3 0 .5-.2.7l-.4.4c-.1.2-.2.4 0 .7.5.9 1.3 1.6 2.3 2 .3.1.5.1.7-.1l.4-.5c.2-.2.4-.2.7-.1.7.3 1.2.6 1.2.8.2 1-1 1.6-1.8 1.6-2.4 0-5-2.6-5-5 0-.8.6-2 1.3-2z' },
		{ id: 'signal', label: 'Signal', icon: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM12 6a6 6 0 0 1 6 6 6 6 0 0 1-6 6 6 6 0 0 1-6-6 6 6 0 0 1 6-6z' }
	];

	let pass = $state('');
	let showPass = $state(false);
	let channel = $state('telegram');
	let recipient = $state('');
	let draft = $state('');
	let messages = $state<{ text: string; time: string; via: string; dir: 'out' | 'in' }[]>([]);
	let polling = $state(false);
	let pollTimer: ReturnType<typeof setInterval> | null = null;
	let busy = $state(false);
	let err = $state('');

	let needsRecipient = $derived(channel === 'telegram' || channel === 'email' || channel === 'whatsapp');
	let recipientLabel = $derived(
		channel === 'telegram' ? i18n.t('crypt.recipientTg')
		: channel === 'email' ? i18n.t('crypt.recipientEmail')
		: channel === 'whatsapp' ? i18n.t('crypt.recipientWa')
		: i18n.t('crypt.recipientSignal')
	);

	function nowTime() {
		return new Date().toLocaleTimeString(i18n.lang === 'en' ? 'en-GB' : 'de-DE', { hour: '2-digit', minute: '2-digit' });
	}

	async function send() {
		err = '';
		if (!pass) { err = i18n.t('crypt.needKey'); return; }
		if (!draft.trim()) return;
		if (needsRecipient && !recipient.trim()) { err = i18n.t('crypt.needRecipient'); return; }
		busy = true;
		try {
			const block = await encryptMessage(draft, pass);
			let via = '';
			if (channel === 'telegram') {
				const res = await fetch('/api/crypt/send', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ channel, to: recipient, text: block }) });
				const d = await res.json().catch(() => ({}));
				if (!res.ok) { err = d.message ?? i18n.t('crypt.sendFail'); busy = false; return; }
				via = 'Telegram';
			} else if (channel === 'email') {
				const subj = encodeURIComponent('Astoris');
				window.location.href = `mailto:${encodeURIComponent(recipient)}?subject=${subj}&body=${encodeURIComponent(block)}`;
				via = 'E-Mail';
			} else if (channel === 'whatsapp') {
				const num = recipient.replace(/[^0-9]/g, '');
				window.open(`https://wa.me/${num}?text=${encodeURIComponent(block)}`, '_blank', 'noopener');
				via = 'WhatsApp';
			} else if (channel === 'signal') {
				if (typeof navigator !== 'undefined' && navigator.share) await navigator.share({ text: block });
				else { await navigator.clipboard?.writeText(block); err = i18n.t('crypt.signalCopied'); }
				via = 'Signal';
			}
			messages = [...messages, { text: draft, time: nowTime(), via, dir: 'out' }];
			draft = '';
		} catch (e) {
			if ((e as { name?: string })?.name !== 'AbortError') err = i18n.t('crypt.encFail');
		}
		busy = false;
	}
	async function receive() {
		if (!pass) return;
		try {
			const d = await (await fetch('/api/crypt/receive')).json();
			for (const m of d.messages ?? []) {
				if (!isEncryptedBlock(m.text)) continue;
				try {
					const clear = await decryptMessage(m.text, pass);
					messages = [...messages, { text: clear, time: nowTime(), via: m.from || 'Telegram', dir: 'in' }];
				} catch { /* nicht mit diesem Schlüssel lesbar → ignorieren */ }
			}
		} catch { /* offline */ }
	}
	onMount(() => {
		pollTimer = setInterval(() => { if (pass) { polling = true; receive(); } }, 6000);
	});
	onDestroy(() => { if (pollTimer) clearInterval(pollTimer); });
	function onKey(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
	}
</script>

<div class="crypt">
	<div class="setup">
		<label class="keyfield">
			<span>{i18n.t('crypt.key')}</span>
			<div class="pwwrap">
				<input type={showPass ? 'text' : 'password'} bind:value={pass} autocomplete="off" placeholder="••••••••" />
				<button type="button" class="eye" onclick={() => (showPass = !showPass)} aria-label="toggle">
					{#if showPass}<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M9.9 4.2A10.9 10.9 0 0 1 12 4c6.5 0 10 7 10 7a18 18 0 0 1-3 3.8M6.5 6.5A18 18 0 0 0 2 11s3.5 7 10 7a10.9 10.9 0 0 0 3.5-.6M3 3l18 18"/></svg>
					{:else}<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>{/if}
				</button>
			</div>
			<small>{i18n.t('crypt.keyHint')}</small>
		</label>
		<div class="chrow">
			<div class="channels">
				{#each CHANNELS as c (c.id)}
					<button class="chip" class:sel={channel === c.id} onclick={() => (channel = c.id)}>
						<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d={c.icon} /></svg>
						{c.label}
					</button>
				{/each}
			</div>
			{#if needsRecipient}
				<input class="recip" bind:value={recipient} placeholder={recipientLabel} autocomplete="off" />
			{/if}
			<button class="fetchbtn" onclick={receive} title={i18n.t('crypt.fetch')} aria-label={i18n.t('crypt.fetch')}>
				<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36M21 4v5h-5"/></svg>
				{i18n.t('crypt.fetch')}
			</button>
		</div>
		{#if polling}<div class="pollnote">● {i18n.t('crypt.polling')}</div>{/if}
	</div>

	<div class="thread">
		{#if messages.length === 0}
			<div class="empty">{i18n.t('crypt.empty')}</div>
		{:else}
			{#each messages as m, i (i)}
				<div class="bubble" class:in={m.dir === 'in'}>
					<div class="txt">{m.text}</div>
					<div class="meta">🔒 {m.time} · {i18n.t('crypt.via')} {m.via}</div>
				</div>
			{/each}
		{/if}
	</div>

	{#if err}<div class="err">{err}</div>{/if}

	<div class="composer">
		<textarea bind:value={draft} onkeydown={onKey} rows="1" placeholder={i18n.t('crypt.placeholder')}></textarea>
		<button class="send" disabled={busy || !draft.trim()} onclick={send} aria-label={i18n.t('crypt.send')} title={i18n.t('crypt.send')}>
			<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>
		</button>
	</div>
</div>

<style>
	.crypt { flex: 1; display: flex; flex-direction: column; min-height: 0; max-width: 760px; width: 100%; margin: 0 auto; }
	.setup { padding: 18px 24px 14px; border-bottom: 1px solid var(--border-soft); display: flex; flex-direction: column; gap: 14px; }
	.keyfield span { display: block; font-size: 12px; color: var(--text-muted); margin-bottom: 5px; }
	.keyfield small { display: block; font-size: 11px; color: var(--text-faint); margin-top: 5px; }
	.pwwrap { position: relative; display: flex; align-items: center; }
	.pwwrap input { width: 100%; background: var(--surface-1); border: 1px solid var(--border); border-radius: 9px; padding: 9px 40px 9px 12px; color: var(--text); font-size: 13.5px; }
	.pwwrap input:focus { outline: none; border-color: var(--ember-line); }
	.eye { position: absolute; right: 7px; width: 28px; height: 28px; display: grid; place-items: center; border: none; background: transparent; color: var(--text-faint); border-radius: 6px; }
	.eye:hover { color: var(--text); }
	.chrow { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
	.channels { display: flex; gap: 6px; flex-wrap: wrap; }
	.chip { display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; color: var(--text-muted); background: var(--surface-1); border: 1px solid var(--border); border-radius: 999px; padding: 6px 12px; transition: all 0.15s; }
	.chip:hover { color: var(--text); border-color: var(--text-faint); }
	.chip.sel { color: var(--ember-bright); background: var(--ember-soft); border-color: var(--ember-line); }
	.recip { flex: 1; min-width: 180px; background: var(--surface-1); border: 1px solid var(--border); border-radius: 9px; padding: 8px 12px; color: var(--text); font-size: 13px; }
	.recip:focus { outline: none; border-color: var(--ember-line); }
	.thread { flex: 1; overflow-y: auto; padding: 20px 24px; display: flex; flex-direction: column; gap: 10px; }
	.empty { margin: auto; text-align: center; color: var(--text-muted); font-size: 13.5px; max-width: 420px; line-height: 1.6; }
	.bubble { align-self: flex-end; max-width: 80%; background: var(--ember-soft); border: 1px solid var(--ember-line); border-radius: 14px 14px 4px 14px; padding: 10px 13px; }
	.bubble .txt { font-size: 14px; color: var(--text); white-space: pre-wrap; word-break: break-word; }
	.bubble .meta { font-size: 10.5px; color: var(--text-faint); margin-top: 5px; }
	.bubble.in { align-self: flex-start; background: var(--surface-2); border-color: var(--border-soft); border-radius: 14px 14px 14px 4px; }
	.fetchbtn { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text-muted); background: var(--surface-1); border: 1px solid var(--border); border-radius: 999px; padding: 6px 12px; transition: all 0.15s; }
	.fetchbtn:hover { color: var(--text); border-color: var(--text-faint); }
	.pollnote { font-size: 10.5px; color: var(--sage); margin-top: 8px; }
	.err { margin: 0 24px; background: var(--danger-soft); color: var(--danger); border-radius: 9px; padding: 9px 13px; font-size: 12.5px; }
	.composer { flex: none; display: flex; align-items: flex-end; gap: 9px; padding: 14px 24px 20px; }
	.composer textarea { flex: 1; resize: none; background: var(--surface-1); border: 1px solid var(--border); border-radius: 13px; padding: 12px 14px; color: var(--text); font: inherit; font-size: 14px; max-height: 140px; }
	.composer textarea:focus { outline: none; border-color: var(--ember-line); }
	.send { width: 46px; height: 46px; flex: none; display: grid; place-items: center; border-radius: 13px; background: var(--ember); color: #1a1206; border: none; transition: background 0.16s; }
	.send:disabled { opacity: 0.45; }
	.send:not(:disabled):hover { background: var(--ember-bright); }
</style>
