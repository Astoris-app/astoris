<script lang="ts">
	import InfoHint from '$lib/components/InfoHint.svelte';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import AppHeader from '$lib/components/AppHeader.svelte';
	import { theme, ACCENTS } from '$lib/stores/theme.svelte';
	import { engine } from '$lib/stores/engine.svelte';
	import { i18n } from '$lib/stores/i18n.svelte';
	import { hints } from '$lib/stores/hints.svelte';
	import { voice } from '$lib/stores/voice.svelte';

	const densities = $derived([
		{ id: 'kompakt', label: i18n.t('settings.compact') },
		{ id: 'normal', label: i18n.t('settings.normal') },
		{ id: 'gross', label: i18n.t('settings.large') }
	]);

	let me = $state<{ name: string; method: string } | null>(null);
	let oldPw = $state('');
	let newPw = $state('');
	let pwMsg = $state('');
	let pwOk = $state(false);
	let busy = $state(false);
	let aigateMode = $state('redact');
	let kiSource = $state('auto');
	let sendMode = $state('confirm');

	onMount(async () => {
		try {
			const d = await (await fetch('/api/auth')).json();
			me = d.user;
		} catch { /* ignore */ }
		try {
			const a = await (await fetch('/api/aigate')).json();
			if (a.mode) aigateMode = a.mode;
		} catch { /* ignore */ }
		try {
			const k = await (await fetch('/api/ki-source')).json();
			if (k.source) kiSource = k.source;
		} catch { /* ignore */ }
		try {
			const s = await (await fetch('/api/send-mode')).json();
			if (s.mode) sendMode = s.mode;
		} catch { /* ignore */ }
	});
	async function setAigate(mode: string) {
		aigateMode = mode;
		await fetch('/api/aigate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mode }) });
	}
	async function setKi(source: string) {
		kiSource = source;
		await fetch('/api/ki-source', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ source }) });
	}

	async function setSendMode(mode: string) {
		sendMode = mode;
		await fetch('/api/send-mode', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mode }) });
	}

	async function changePw() {
		pwMsg = ''; pwOk = false;
		if (newPw.length < 8) { pwMsg = i18n.t('settings.pwTooShort'); return; }
		busy = true;
		try {
			const d = await (await fetch('/api/auth', {
				method: 'POST', headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ action: 'change-password', oldPassword: oldPw, newPassword: newPw })
			})).json();
			if (d.ok) { pwOk = true; pwMsg = i18n.t('settings.pwChanged'); oldPw = ''; newPw = ''; }
			else pwMsg = d.error ?? i18n.t('settings.pwFailed');
		} catch { pwMsg = i18n.t('settings.networkError'); }
		finally { busy = false; }
	}

	async function logout() {
		await fetch('/api/auth', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'logout' }) });
		goto('/login');
	}
</script>

<AppHeader title={i18n.t('settings.title')} eyebrow={i18n.t('settings.eyebrow')} />

<div class="scroll">
	<!-- Aussehen -->
	<section class="card">
		<h2>{i18n.t('settings.appearance')}</h2>
		<p class="lbl">{i18n.t('settings.mode')}</p>
		<div class="seg">
			<button class:sel={theme.mode === 'dark'} onclick={() => theme.setMode('dark')}>{i18n.t('settings.dark')}</button>
			<button class:sel={theme.mode === 'light'} onclick={() => theme.setMode('light')}>{i18n.t('settings.light')}</button>
		</div>
		<p class="lbl">{i18n.t('settings.accent')}</p>
		<div class="swatches">
			{#each ACCENTS as a (a.id)}
				<button class="sw" class:sel={theme.accent === a.id} onclick={() => theme.setAccent(a.id)} title={a.label}>
					<span class="dot" style="background:{a.ember}"></span>
					<span>{a.label}</span>
				</button>
			{/each}
		</div>
		<p class="lbl">{i18n.t('settings.fontSize')}</p>
		<div class="seg">
			{#each densities as d (d.id)}
				<button class:sel={theme.density === d.id} onclick={() => theme.setDensity(d.id)}>{d.label}</button>
			{/each}
		</div>
		<p class="lbl">{i18n.t('settings.language')}</p>
		<div class="seg">
			<button class:sel={i18n.lang === 'de'} onclick={() => i18n.set('de')}>Deutsch</button>
			<button class:sel={i18n.lang === 'en'} onclick={() => i18n.set('en')}>English</button>
		</div>
		<p class="lbl">{i18n.t('settings.hints')}</p>
		<div class="seg">
			<button class:sel={hints.enabled} onclick={() => hints.set(true)}>{i18n.t('settings.on')}</button>
			<button class:sel={!hints.enabled} onclick={() => hints.set(false)}>{i18n.t('settings.off')}</button>
		</div>
	</section>

	<!-- Spracheingabe -->
	<section class="card">
		<h2>{i18n.t('settings.voice')}</h2>
		<p class="lbl">{i18n.t('settings.voiceInput')}</p>
		<div class="seg">
			<button class:sel={voice.enabled} onclick={() => voice.set(true)}>{i18n.t('settings.on')}</button>
			<button class:sel={!voice.enabled} onclick={() => voice.set(false)}>{i18n.t('settings.off')}</button>
		</div>
		{#if voice.enabled}
			<p class="lbl">{i18n.t('settings.voiceMode')}</p>
			<div class="seg">
				<button class:sel={voice.mode === 'toggle'} onclick={() => voice.setMode('toggle')}>{i18n.t('settings.voiceToggle')}</button>
				<button class:sel={voice.mode === 'ptt'} onclick={() => voice.setMode('ptt')}>{i18n.t('settings.voicePtt')}</button>
			</div>
		{/if}
	</section>

	<!-- KI-Quelle -->
	<section class="card">
		<h2>{i18n.t('settings.kiSource')}</h2>
		<p class="lbl">{i18n.t('settings.kiSourceHint')}</p>
		<div class="seg">
			<button class:sel={kiSource === 'auto'} onclick={() => setKi('auto')}>{i18n.t('settings.kiSourceAuto')}</button>
			<button class:sel={kiSource === 'local'} onclick={() => setKi('local')}>{i18n.t('settings.kiSourceLocal')}</button>
			<button class:sel={kiSource === 'cloud'} onclick={() => setKi('cloud')}>{i18n.t('settings.kiSourceCloud')}</button>
		</div>
	</section>

	<!-- Nachrichten-Versand -->
	<section class="card">
		<h2>{i18n.t('settings.sendMode')}</h2>
		<p class="lbl">{i18n.t('settings.sendModeHint')}</p>
		<div class="seg">
			<button class:sel={sendMode === 'confirm'} onclick={() => setSendMode('confirm')}>{i18n.t('settings.sendModeConfirm')}</button>
			<button class:sel={sendMode === 'direct'} onclick={() => setSendMode('direct')}>{i18n.t('settings.sendModeDirect')}</button>
		</div>
	</section>

	<!-- aigate Cloud-Schutz -->
	<section class="card">
		<h2>{i18n.t('settings.aigate')} <span class="prem">Premium</span> <InfoHint text={i18n.t('settings.aigateInfo')} /></h2>
		<p class="lbl">{i18n.t('settings.aigateHint')}</p>
		<div class="seg">
			<button class:sel={aigateMode === 'off'} title={i18n.t('settings.aigateOffDesc')} onclick={() => setAigate('off')}>{i18n.t('settings.aigateOff')}</button>
			<button class:sel={aigateMode === 'redact'} title={i18n.t('settings.aigateRedactDesc')} onclick={() => setAigate('redact')}>{i18n.t('settings.aigateRedact')}</button>
			<button class:sel={aigateMode === 'block'} title={i18n.t('settings.aigateBlockDesc')} onclick={() => setAigate('block')}>{i18n.t('settings.aigateBlock')}</button>
		</div>
		<p class="lbl aigate-active">{aigateMode === 'off' ? i18n.t('settings.aigateOffDesc') : aigateMode === 'redact' ? i18n.t('settings.aigateRedactDesc') : i18n.t('settings.aigateBlockDesc')}</p>
	</section>

	<!-- KI -->
	<section class="card">
		<h2>{i18n.t('settings.model')}</h2>
		<div class="row">
			<div>
				<strong>{engine.status.online ? engine.status.model : i18n.t('settings.notConnected')}</strong>
				<small>{engine.status.detail}</small>
			</div>
			<a class="btn ghost" href="/connections">{i18n.t('settings.connections')}</a>
		</div>
	</section>

	<!-- Sicherheit -->
	<section class="card">
		<h2>{i18n.t('settings.security')}</h2>
		<div class="row">
			<div><strong>{i18n.t('settings.signedInAs')} {me?.name ?? '…'}</strong><small>{me?.method === 'tailscale' ? i18n.t('settings.viaTailscale') : i18n.t('settings.viaPassword')}</small></div>
			<button class="btn ghost" onclick={logout}>{i18n.t('settings.logout')}</button>
		</div>
		<p class="lbl">{i18n.t('settings.changePw')}</p>
		<input type="password" bind:value={oldPw} placeholder={i18n.t('settings.currentPw')} autocomplete="current-password" />
		<input type="password" bind:value={newPw} placeholder={i18n.t('settings.newPw')} autocomplete="new-password" />
		<button class="btn primary" onclick={changePw} disabled={busy}>{busy ? i18n.t('settings.changing') : i18n.t('settings.changePw')}</button>
		{#if pwMsg}<div class="msg" class:ok={pwOk}>{pwMsg}</div>{/if}
	</section>

	<!-- Erste Schritte -->
	<section class="card">
		<h2>{i18n.t('settings.onboarding')}</h2>
		<div class="row">
			<div><strong>{i18n.t('settings.replayTour')}</strong><small>{i18n.t('settings.replayTourHint')}</small></div>
			<button class="btn ghost" onclick={() => goto('/welcome?replay=1')}>{i18n.t('settings.replayTour')}</button>
		</div>
	</section>

	<!-- Über -->
	<section class="card about">
		<h2>{i18n.t('settings.about')}</h2>
		<p>{i18n.t('settings.aboutText')}</p>
		<p class="mono"><a href="https://astoris.org" target="_blank" rel="noopener">astoris.org</a> · <a href="mailto:info@astoris.org">info@astoris.org</a></p>
	</section>
</div>

<style>
	.scroll { flex: 1; overflow-y: auto; padding: 24px 28px 40px; max-width: 680px; width: 100%; margin: 0 auto; }
	.card { background: var(--surface-1); border: 1px solid var(--border-soft); border-radius: var(--radius); padding: 20px; margin-bottom: 16px; }
	.card h2 { font-size: 16px; margin-bottom: 14px; }
	.lbl { font-size: 12.5px; color: var(--text-muted); margin: 14px 0 8px; }
	.swatches { display: flex; flex-wrap: wrap; gap: 8px; }
	.sw { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-radius: 10px; border: 1px solid var(--border-soft); background: var(--surface-2); color: var(--text-muted); font-size: 13px; transition: all 0.16s; }
	.sw:hover { color: var(--text); }
	.sw.sel { border-color: var(--ember); color: var(--text); background: var(--ember-soft); }
	.sw .dot { width: 14px; height: 14px; border-radius: 50%; }
	.seg { display: inline-flex; background: var(--surface-2); border: 1px solid var(--border-soft); border-radius: 9px; padding: 3px; }
	.seg button { padding: 7px 16px; border-radius: 7px; font-size: 13px; color: var(--text-muted); background: transparent; border: none; transition: all 0.16s; }
	.seg button.sel { background: var(--ember); color: #1a1206; font-weight: 500; }
	.row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
	.row strong { display: block; font-size: 14px; }
	.row small { color: var(--text-faint); font-size: 12px; }
	input[type='password'] { width: 100%; background: var(--bg); border: 1px solid var(--border); border-radius: 9px; color: var(--text); padding: 10px 12px; font-size: 13.5px; font-family: var(--font-body); margin-bottom: 9px; }
	input:focus { outline: none; border-color: var(--ember-line); }
	.btn { border-radius: 9px; padding: 9px 15px; font-size: 13px; font-weight: 500; border: 1px solid transparent; transition: all 0.16s; cursor: pointer; }
	.btn.primary { background: var(--ember); color: #1a1206; }
	.btn.primary:disabled { opacity: 0.5; }
	.btn.ghost { background: transparent; border: 1px solid var(--border); color: var(--text-muted); text-decoration: none; }
	.btn.ghost:hover { color: var(--text); border-color: var(--text-faint); }
	.msg { margin-top: 10px; padding: 9px 12px; border-radius: 8px; font-size: 12.5px; background: var(--danger-soft); color: var(--danger); }
	.msg.ok { background: var(--sage-soft); color: var(--sage); }
	.about p { color: var(--text-muted); font-size: 13.5px; margin: 0 0 8px; }
	.about a { color: var(--ember-bright); }
	.prem { font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--ember-bright); background: var(--ember-soft); border: 1px solid var(--ember-line); padding: 2px 7px; border-radius: 999px; vertical-align: middle; margin-left: 6px; }
</style>
