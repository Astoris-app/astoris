<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import Brand from '$lib/components/Brand.svelte';
	import { i18n } from '$lib/stores/i18n.svelte';

	let loading = $state(true);
	let configured = $state(false);
	let passwordSet = $state(false);
	let ts = $state<{ login: string; name: string; allowed: boolean } | null>(null);
	let username = $state('');
	let pw = $state('');
	let pw2 = $state('');
	let setupToken = $state('');
	let err = $state('');
	let busy = $state(false);
	async function openWorkspace() {
		const response = await fetch('/api/setup');
		if (!response.ok) throw new Error('Setup status unavailable');
		const status = await response.json();
		await goto(status.done ? '/' : '/welcome');
	}

	async function loadStatus() {
		try {
			const res = await fetch('/api/auth');
			const d = await res.json();
			if (d.user) { await openWorkspace(); return; }
			configured = d.configured;
			passwordSet = d.passwordSet;
			ts = d.tailscale;
		} catch { /* offline */ }
		loading = false;
	}
	onMount(loadStatus);

	async function post(action: string, payload: Record<string, unknown> = {}) {
		busy = true; err = '';
		try {
			const res = await fetch('/api/auth', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ action, ...payload })
			});
			const d = await res.json();
			if (d.ok) { await openWorkspace(); return; }
			err = d.error ?? i18n.t('login.failed');
		} catch {
			err = i18n.t('login.networkError');
		} finally {
			busy = false;
		}
	}

	function setup() {
		if (username.trim().length < 3) { err = i18n.t('login.userTooShort'); return; }
		if (pw.length < 8) { err = i18n.t('login.pwTooShort'); return; }
		if (pw !== pw2) { err = i18n.t('login.pwMismatch'); return; }
		post('set-password', { username: username.trim(), password: pw, setupToken });
	}
	function login() {
		post('login', { username: username.trim(), password: pw });
	}
</script>

<div class="wrap">
	<div class="panel">
		<div class="head">
			<Brand size={44} />
			<h1>Astoris</h1>
		</div>

		{#if loading}
			<p class="sub">{i18n.t('login.loading')}</p>
		{:else if !configured}
			<h2>{i18n.t('login.setupTitle')}</h2>
			<p class="sub">{i18n.t('login.setupSub')}{#if ts}{i18n.t('login.setupSubTs')}{/if}.</p>

			{#if ts}
				<button class="ts" onclick={() => post('tailscale')} disabled={busy}>
					<span class="tsdot"></span> {i18n.t('login.tsSetup')} — {ts.name}
				</button>
				<div class="divider"><span>{i18n.t('login.orCredentials')}</span></div>
			{/if}

			<form onsubmit={(event) => { event.preventDefault(); setup(); }}>
				<label for="setup-user">{i18n.t('login.username')}</label>
				<input id="setup-user" bind:value={username} autocomplete="username" required minlength="3" />
				<label for="setup-password">{i18n.t('login.passwordMin')}</label>
				<input id="setup-password" type="password" bind:value={pw} autocomplete="new-password" required minlength="8" />
				<label for="setup-repeat">{i18n.t('login.passwordRepeat')}</label>
				<input id="setup-repeat" type="password" bind:value={pw2} autocomplete="new-password" required minlength="8" />
				<details>
					<summary>{i18n.lang === 'de' ? 'Einrichtung über einen Reverse-Proxy?' : 'Setting up behind a reverse proxy?'}</summary>
					<p class="hint">{i18n.lang === 'de' ? 'Falls der lokale Erstzugang nicht erkannt wird: Den vom Betreiber bereitgestellten Einrichtungs-Token eingeben. Kein API-Schlüssel des KI-Anbieters.' : 'If local setup is not recognized, enter the setup token provided by your operator. This is not your AI provider API key.'}</p>
					<label for="setup-token">{i18n.lang === 'de' ? 'Einrichtungs-Token (optional)' : 'Setup token (optional)'}</label>
					<input id="setup-token" type="password" bind:value={setupToken} autocomplete="off" spellcheck="false" />
				</details>
				<button class="primary" disabled={busy}>{busy ? i18n.t('login.setupBusy') : i18n.t('login.setupBtn')}</button>
			</form>
		{:else}
			<h2>{i18n.t('login.loginTitle')}</h2>
			{#if ts && ts.allowed}
				<button class="ts" onclick={() => post('tailscale')} disabled={busy}>
					<span class="tsdot"></span> {i18n.t('login.tsLogin')} — {ts.name}
				</button>
				{#if passwordSet}<div class="divider"><span>{i18n.t('login.orCredentials')}</span></div>{/if}
			{/if}
			{#if passwordSet}
				<form onsubmit={(event) => { event.preventDefault(); login(); }}>
					<label for="login-user">{i18n.t('login.username')}</label>
					<input id="login-user" bind:value={username} autocomplete="username" required />
					<label for="login-password">{i18n.t('login.password')}</label>
					<input id="login-password" type="password" bind:value={pw} autocomplete="current-password" required />
					<button class="primary" disabled={busy}>{busy ? i18n.t('login.loginBusy') : i18n.t('login.loginBtn')}</button>
				</form>
			{/if}
		{/if}

		{#if err}<div class="err" role="alert">{err}</div>{/if}
		<p class="foot mono">{i18n.t('login.foot')}</p>
	</div>
</div>

<style>
	.wrap { flex: 1; min-height: 0; overflow: auto; display: flex; align-items: flex-start; justify-content: center; padding: 24px; }
	.panel { width: 100%; max-width: 380px; flex: none; margin-block: auto; background: var(--surface-1); border: 1px solid var(--border-soft); border-radius: var(--radius-lg); padding: 32px 28px; box-shadow: var(--shadow); }
	.head { display: flex; flex-direction: column; align-items: center; gap: 12px; margin-bottom: 22px; }
	.head h1 { font-size: 24px; }
	h2 { font-size: 18px; text-align: center; margin-bottom: 6px; }
	.sub { color: var(--text-muted); font-size: 13.5px; text-align: center; margin: 0 0 20px; line-height: 1.5; }
	label { display: block; margin: 12px 0 6px; font-size: 13px; color: var(--text); }
	details { margin: 14px 0; font-size: 13px; } summary { cursor: pointer; }
	.hint { color: var(--text-muted); line-height: 1.6; }
	input { width: 100%; background: var(--bg); border: 1px solid var(--border); border-radius: 10px; color: var(--text); padding: 12px 14px; font-family: var(--font-body); font-size: 14px; margin-bottom: 10px; }
	input:focus { outline: 2px solid var(--link); outline-offset: 2px; border-color: var(--link); }
	.primary { width: 100%; background: var(--ember); color: #1a1206; border: none; border-radius: 10px; padding: 12px; font-size: 14.5px; font-weight: 500; margin-top: 4px; transition: all 0.16s; }
	.primary:disabled { opacity: 0.5; }
	.primary:not(:disabled):hover { background: var(--ember-bright); }
	.ts { width: 100%; display: flex; align-items: center; justify-content: center; gap: 10px; background: var(--surface-2); border: 1px solid var(--border); color: var(--text); border-radius: 10px; padding: 12px; font-size: 14px; font-weight: 500; transition: all 0.16s; }
	.ts:not(:disabled):hover { border-color: var(--sage); }
	.tsdot { width: 9px; height: 9px; border-radius: 50%; background: var(--sage); }
	.divider { display: flex; align-items: center; gap: 12px; margin: 16px 0; color: var(--text-faint); font-size: 11px; }
	.divider::before, .divider::after { content: ''; flex: 1; height: 1px; background: var(--border-soft); }
	.err { margin-top: 14px; padding: 10px 12px; border-radius: 9px; background: var(--danger-soft); color: var(--danger); font-size: 13px; text-align: center; }
	.foot { text-align: center; font-size: 10.5px; color: var(--text-faint); margin: 20px 0 0; }
</style>
