<script lang="ts">
	import { onMount } from 'svelte';
	import AppHeader from '$lib/components/AppHeader.svelte';
	import { handoff } from '$lib/stores/handoff.svelte';
	import { i18n } from '$lib/stores/i18n.svelte';
	import { encryptMessage, decryptMessage, encryptFile, decryptFile, isEncryptedBlock } from '$lib/crypto/messageCrypto';

	let mode = $state<'enc' | 'dec'>('enc');
	let secure = $state(true);
	let pass = $state('');
	let input = $state('');
	let output = $state('');
	let err = $state('');
	let busy = $state(false);
	let copied = $state(false);
	let fileIn: File | null = $state(null);
	let decFile: { blob: Blob; name: string } | null = $state(null);
	let fileInput = $state<HTMLInputElement | undefined>();
	let canShare = $state(false);

	$effect(() => {
		secure = typeof window === 'undefined' ? true : (window.isSecureContext ?? false);
		canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
	});

	// Aus dem Chat übergebener Text → direkt zum Verschlüsseln vorausfüllen.
	onMount(() => {
		const t = handoff.take();
		if (t) { input = t; mode = 'enc'; }
	});

	async function run() {
		err = ''; output = ''; decFile = null; copied = false;
		if (!pass) { err = i18n.t('tresor.needPassphrase'); return; }
		busy = true;
		try {
			if (mode === 'enc') {
				if (fileIn) output = await encryptFile(fileIn, pass);
				else if (input.trim()) output = await encryptMessage(input, pass);
				else err = i18n.t('tresor.nothingToEncrypt');
			} else {
				const kind = isEncryptedBlock(input);
				if (kind === 'file') {
					const r = await decryptFile(input, pass);
					decFile = { blob: r.blob, name: r.name };
				} else {
					output = await decryptMessage(input, pass);
				}
			}
		} catch (e: any) {
			err = e?.message?.includes('Secure Context') ? e.message : i18n.t('tresor.failed');
		} finally {
			busy = false;
		}
	}

	function pickFile(e: Event) {
		const f = (e.target as HTMLInputElement).files?.[0] ?? null;
		fileIn = f;
		if (f) input = '';
	}

	async function copyOut() {
		try {
			if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(output);
			copied = true;
			setTimeout(() => (copied = false), 1500);
		} catch { /* ignore */ }
	}

	function saveFile() {
		if (!decFile) return;
		const a = document.createElement('a');
		a.href = URL.createObjectURL(decFile.blob);
		a.download = decFile.name;
		a.click();
		URL.revokeObjectURL(a.href);
	}

	function clearFile() { fileIn = null; if (fileInput) fileInput.value = ''; }
	function reset() { input = ''; output = ''; err = ''; fileIn = null; decFile = null; if (fileInput) fileInput.value = ''; }

	// --- Teilen ---
	const shareSubject = $derived(i18n.t('tresor.shareSubject'));
	const tooLongForLink = $derived(output.length > 1500); // Messenger-URL-Limit

	async function shareNative() {
		try { await navigator.share({ title: shareSubject, text: output }); } catch { /* abgebrochen */ }
	}
	function shareVia(platform: string) {
		const t = encodeURIComponent(output);
		const links: Record<string, string> = {
			telegram: `https://t.me/share/url?url=${encodeURIComponent('https://astoris.org')}&text=${t}`,
			whatsapp: `https://wa.me/?text=${t}`,
			gmail: `https://mail.google.com/mail/?view=cm&fs=1&su=${encodeURIComponent(shareSubject)}&body=${t}`,
			email: `mailto:?subject=${encodeURIComponent(shareSubject)}&body=${t}`
		};
		const u = links[platform];
		if (u) window.open(u, '_blank', 'noopener');
	}
	let signalNote = $state(false);
	async function shareSignal() {
		// Signal bietet keinen Text-Vorausfüll-Link → System-Teilen (zeigt Signal, wenn installiert), sonst kopieren.
		if (canShare) { await shareNative(); return; }
		await copyOut();
		signalNote = true;
		setTimeout(() => (signalNote = false), 4000);
	}
</script>

<AppHeader title={i18n.t('tresor.title')} eyebrow={i18n.t('tresor.eyebrow')} />

<div class="wrap">
	{#if !secure}
		<div class="banner">
			🔒 {i18n.t('tresor.httpsBanner')} <strong>HTTPS</strong>. {i18n.t('tresor.httpsBannerSuffix')} <code>https://</code>.
		</div>
	{/if}

	<div class="toggle">
		<button class:active={mode === 'enc'} onclick={() => { mode = 'enc'; reset(); }}>{i18n.t('tresor.encrypt')}</button>
		<button class:active={mode === 'dec'} onclick={() => { mode = 'dec'; reset(); }}>{i18n.t('tresor.decrypt')}</button>
	</div>

	<label class="field">
		<span>{i18n.t('tresor.passphrase')} <em>{i18n.t('tresor.passphraseHint')}</em></span>
		<input type="password" bind:value={pass} placeholder={i18n.t('tresor.passphrasePlaceholder')} autocomplete="off" />
	</label>

	{#if mode === 'enc'}
		<label class="field">
			<span>{i18n.t('tresor.message')}</span>
			<textarea bind:value={input} rows="5" placeholder={i18n.t('tresor.plaintextPlaceholder')} disabled={!!fileIn}></textarea>
		</label>
		<div class="orfile">
			<span class="or">{i18n.t('tresor.orFile')}</span>
			<input type="file" bind:this={fileInput} onchange={pickFile} />
			{#if fileIn}
				<span class="fname">{fileIn.name}</span>
				<button class="rmfile" onclick={clearFile} title={i18n.t('tresor.removeAttachment')} aria-label={i18n.t('tresor.removeAttachment')}>×</button>
			{/if}
		</div>
	{:else}
		<label class="field">
			<span>{i18n.t('tresor.encryptedBlock')}</span>
			<textarea bind:value={input} rows="5" placeholder={i18n.t('tresor.encryptedBlockPlaceholder')}></textarea>
		</label>
	{/if}

	<button class="run" onclick={run} disabled={busy || !secure}>
		{busy ? i18n.t('tresor.working') : mode === 'enc' ? i18n.t('tresor.encrypt') : i18n.t('tresor.decrypt')}
	</button>

	{#if err}<div class="msg bad">{err}</div>{/if}

	{#if output}
		<div class="result">
			<div class="rhead">
				<span class="eyebrow">{mode === 'enc' ? i18n.t('tresor.encryptedResult') : i18n.t('tresor.decryptedResult')}</span>
				<button class="mini" onclick={copyOut}>{copied ? i18n.t('tresor.copied') : i18n.t('tresor.copy')}</button>
			</div>
			<pre class="out">{output}</pre>

			{#if mode === 'enc'}
				<div class="share">
					<span class="eyebrow">{i18n.t('tresor.share')}</span>
					<div class="sbtns">
						{#if canShare}
							<button class="sb native" onclick={shareNative} title={i18n.t('tresor.shareNative')}>
								<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="M8.2 10.8 15.8 6.2M8.2 13.2l7.6 4.6"/></svg>
								<span>{i18n.t('tresor.shareNative')}</span>
							</button>
						{/if}
						<button class="sb tg" onclick={() => shareVia('telegram')} disabled={tooLongForLink} title="Telegram">
							<svg viewBox="0 0 24 24" fill="currentColor"><path d="M21.9 4.3 18.7 19.4c-.2 1-.9 1.3-1.7.8l-4.7-3.5-2.3 2.2c-.3.3-.5.5-1 .5l.3-4.8 8.8-7.9c.4-.3-.1-.5-.6-.2L6.7 13 2 11.6c-1-.3-1-1 .2-1.5L20.6 3c.9-.3 1.6.2 1.3 1.3z"/></svg>
							<span>Telegram</span>
						</button>
						<button class="sb wa" onclick={() => shareVia('whatsapp')} disabled={tooLongForLink} title="WhatsApp">
							<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 0 0-8.5 15.3L2 22l4.8-1.3A10 10 0 1 0 12 2zm0 18a8 8 0 0 1-4.1-1.1l-.3-.2-2.8.7.8-2.7-.2-.3A8 8 0 1 1 12 20zm4.4-5.6c-.2-.1-1.4-.7-1.7-.8-.2-.1-.4-.1-.5.1l-.7.9c-.1.2-.3.2-.5.1a6.5 6.5 0 0 1-3.2-2.8c-.1-.2 0-.4.1-.5l.4-.5c.1-.2.1-.3 0-.5l-.7-1.7c-.2-.4-.4-.4-.5-.4h-.5c-.2 0-.5.1-.7.3-.7.7-1 1.7-.7 2.7a8 8 0 0 0 3.5 4.1c1.6.9 2.5.9 3.4.7.5-.1 1.4-.6 1.6-1.2.2-.5.2-1 .1-1.1l-.4-.2z"/></svg>
							<span>WhatsApp</span>
						</button>
						<button class="sb gmail" onclick={() => shareVia('gmail')} disabled={tooLongForLink} title="Gmail">
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3.5 6 12 12.5 20.5 6"/></svg>
							<span>Gmail</span>
						</button>
						<button class="sb sig" onclick={shareSignal} title="Signal (über System-Teilen oder Kopieren)">
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4a8 8 0 0 0-7 11.8L4 20l4.2-1A8 8 0 1 0 12 4z"/></svg>
							<span>Signal</span>
						</button>
						<button class="sb mail" onclick={() => shareVia('email')} disabled={tooLongForLink} title={i18n.t('tresor.email')}>
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5.5" width="18" height="13" rx="2"/><path d="M3.5 6.5 12 13l8.5-6.5"/></svg>
							<span>{i18n.t('tresor.email')}</span>
						</button>
					</div>
					{#if signalNote}
						<p class="hint mono">{i18n.t('tresor.signalNote')}</p>
					{/if}
					{#if tooLongForLink}
						<p class="hint mono">{i18n.t('tresor.tooLongNote')}</p>
					{/if}
				</div>
			{/if}
		</div>
	{/if}

	{#if decFile}
		<div class="result">
			<div class="rhead"><span class="eyebrow">{i18n.t('tresor.fileDecrypted')}</span></div>
			<button class="run" onclick={saveFile}>„{decFile.name}" {i18n.t('tresor.saveFile')}</button>
		</div>
	{/if}
</div>

<style>
	.wrap { flex: 1; overflow-y: auto; padding: 24px 28px 40px; max-width: 720px; width: 100%; margin: 0 auto; }
	.banner { background: var(--danger-soft); border: 1px solid var(--danger-soft); color: var(--text); border-radius: var(--radius); padding: 13px 15px; font-size: 13.5px; margin-bottom: 20px; }
	.banner code { font-family: var(--font-mono); background: var(--surface-2); padding: 1px 5px; border-radius: 4px; }
	.toggle { display: inline-flex; background: var(--surface-1); border: 1px solid var(--border-soft); border-radius: 10px; padding: 3px; margin-bottom: 20px; }
	.toggle button { padding: 8px 18px; border-radius: 8px; font-size: 13.5px; color: var(--text-muted); background: transparent; border: none; transition: all 0.16s; }
	.toggle button.active { background: var(--ember); color: #1a1206; font-weight: 500; }
	.field { display: block; margin-bottom: 16px; }
	.field span { display: block; font-size: 12.5px; color: var(--text-muted); margin-bottom: 6px; }
	.field em { font-style: normal; color: var(--text-faint); }
	input[type='password'], textarea { width: 100%; background: var(--surface-1); border: 1px solid var(--border); border-radius: 10px; color: var(--text); padding: 11px 13px; font-family: var(--font-body); font-size: 14px; }
	textarea { resize: vertical; }
	input:focus, textarea:focus { outline: none; border-color: var(--ember-line); }
	textarea:disabled { opacity: 0.5; }
	.orfile { display: flex; align-items: center; gap: 12px; margin-bottom: 18px; font-size: 13px; color: var(--text-muted); }
	.or { color: var(--text-faint); }
	.fname { color: var(--ember-bright); font-family: var(--font-mono); font-size: 12px; }
	.rmfile { width: 22px; height: 22px; flex: none; border-radius: 50%; border: 1px solid var(--border); background: var(--surface-2); color: var(--text-muted); font-size: 15px; line-height: 1; display: grid; place-items: center; cursor: pointer; transition: all 0.14s; }
	.rmfile:hover { color: var(--danger); border-color: var(--danger); }
	.run { width: 100%; background: var(--ember); color: #1a1206; border: none; border-radius: 11px; padding: 13px; font-size: 14.5px; font-weight: 500; transition: all 0.16s; }
	.run:disabled { opacity: 0.5; cursor: not-allowed; }
	.run:not(:disabled):hover { background: var(--ember-bright); }
	.msg { margin-top: 16px; padding: 11px 13px; border-radius: 10px; font-size: 13px; }
	.msg.bad { background: var(--danger-soft); color: var(--danger); }
	.result { margin-top: 20px; }
	.rhead { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
	.mini { font-size: 12px; color: var(--text-muted); background: var(--surface-1); border: 1px solid var(--border-soft); border-radius: 7px; padding: 5px 11px; transition: all 0.16s; }
	.mini:hover { color: var(--text); border-color: var(--ember-line); }
	.out { background: var(--bg-veil); border: 1px solid var(--border-soft); border-radius: 10px; padding: 13px; font-family: var(--font-mono); font-size: 12px; white-space: pre-wrap; word-break: break-all; max-height: 240px; overflow-y: auto; margin: 0; }
	/* Teilen */
	.share { margin-top: 16px; }
	.share .eyebrow { display: block; margin-bottom: 10px; }
	.sbtns { display: flex; flex-wrap: wrap; gap: 9px; }
	.sb { display: flex; align-items: center; gap: 8px; padding: 9px 14px; border-radius: 10px; border: 1px solid var(--border-soft); background: var(--surface-1); color: var(--text); font-size: 13px; font-weight: 500; transition: all 0.16s var(--ease); }
	.sb svg { width: 17px; height: 17px; }
	.sb:not(:disabled):hover { transform: translateY(-1px); border-color: var(--border); }
	.sb:disabled { opacity: 0.35; cursor: not-allowed; }
	.sb.native { color: var(--ember-bright); }
	.sb.tg { color: #29a9eb; }
	.sb.wa { color: #25d366; }
	.sb.sig { color: #3a76f0; }
	.sb.gmail { color: #ea4335; }
	.sb.mail { color: var(--text-muted); }
	.hint { font-size: 11px; color: var(--text-faint); margin: 10px 0 0; }
</style>
