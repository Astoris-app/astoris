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
	let err = $state('');
	let busy = $state(false);

	async function loadStatus() {
		try {
			const res = await fetch('/api/auth');
			const d = await res.json();
			if (d.user) { goto('/'); return; }
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
			if (d.ok) { goto('/'); return; }
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
		post('set-password', { username: username.trim(), password: pw });
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

			<input type="text" bind:value={username} placeholder={i18n.t('login.username')} autocomplete="username" />
			<input type="password" bind:value={pw} placeholder={i18n.t('login.passwordMin')} autocomplete="new-password" />
			<input type="password" bind:value={pw2} placeholder={i18n.t('login.passwordRepeat')} autocomplete="new-password" />
			<button class="primary" onclick={setup} disabled={busy}>{busy ? i18n.t('login.setupBusy') : i18n.t('login.setupBtn')}</button>
		{:else}
			<h2>{i18n.t('login.loginTitle')}</h2>
			{#if ts && ts.allowed}
				<button class="ts" onclick={() => post('tailscale')} disabled={busy}>
					<span class="tsdot"></span> {i18n.t('login.tsLogin')} — {ts.name}
				</button>
				{#if passwordSet}<div class="divider"><span>{i18n.t('login.orCredentials')}</span></div>{/if}
			{/if}
			{#if passwordSet}
				<input type="text" bind:value={username} placeholder={i18n.t('login.username')} autocomplete="username"
					onkeydown={(e) => e.key === 'Enter' && login()} />
				<input type="password" bind:value={pw} placeholder={i18n.t('login.password')} autocomplete="current-password"
					onkeydown={(e) => e.key === 'Enter' && login()} />
				<button class="primary" onclick={login} disabled={busy}>{busy ? i18n.t('login.loginBusy') : i18n.t('login.loginBtn')}</button>
			{/if}
		{/if}

		{#if err}<div class="err">{err}</div>{/if}
		<p class="foot mono">{i18n.t('login.foot')}</p>
	</div>
</div>

<style>
	.wrap { flex: 1; display: grid; place-items: center; padding: 24px; }
	.panel { width: 100%; max-width: 380px; background: var(--surface-1); border: 1px solid var(--border-soft); border-radius: var(--radius-lg); padding: 32px 28px; box-shadow: var(--shadow); }
	.head { display: flex; flex-direction: column; align-items: center; gap: 12px; margin-bottom: 22px; }
	.head h1 { font-size: 24px; }
	h2 { font-size: 18px; text-align: center; margin-bottom: 6px; }
	.sub { color: var(--text-muted); font-size: 13.5px; text-align: center; margin: 0 0 20px; line-height: 1.5; }
	input { width: 100%; background: var(--bg); border: 1px solid var(--border); border-radius: 10px; color: var(--text); padding: 12px 14px; font-family: var(--font-body); font-size: 14px; margin-bottom: 10px; }
	input:focus { outline: none; border-color: var(--ember-line); }
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
