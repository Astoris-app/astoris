<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import AppHeader from '$lib/components/AppHeader.svelte';
	import { theme, ACCENTS } from '$lib/stores/theme.svelte';
	import { engine } from '$lib/stores/engine.svelte';
	import { i18n } from '$lib/stores/i18n.svelte';

	const densities = [
		{ id: 'kompakt', label: 'Kompakt' },
		{ id: 'normal', label: 'Normal' },
		{ id: 'gross', label: 'Groß' }
	];

	let me = $state<{ name: string; method: string } | null>(null);
	let oldPw = $state('');
	let newPw = $state('');
	let pwMsg = $state('');
	let pwOk = $state(false);
	let busy = $state(false);

	onMount(async () => {
		try {
			const d = await (await fetch('/api/auth')).json();
			me = d.user;
		} catch { /* ignore */ }
	});

	async function changePw() {
		pwMsg = ''; pwOk = false;
		if (newPw.length < 8) { pwMsg = 'Neues Passwort: mindestens 8 Zeichen.'; return; }
		busy = true;
		try {
			const d = await (await fetch('/api/auth', {
				method: 'POST', headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ action: 'change-password', oldPassword: oldPw, newPassword: newPw })
			})).json();
			if (d.ok) { pwOk = true; pwMsg = 'Passwort geändert.'; oldPw = ''; newPw = ''; }
			else pwMsg = d.error ?? 'Fehlgeschlagen.';
		} catch { pwMsg = 'Netzwerkfehler.'; }
		finally { busy = false; }
	}

	async function logout() {
		await fetch('/api/auth', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'logout' }) });
		goto('/login');
	}
</script>

<AppHeader title="Einstellungen" eyebrow="Astoris anpassen" />

<div class="scroll">
	<!-- Aussehen -->
	<section class="card">
		<h2>Aussehen</h2>
		<p class="lbl">Modus</p>
		<div class="seg">
			<button class:sel={theme.mode === 'dark'} onclick={() => theme.setMode('dark')}>Dunkel</button>
			<button class:sel={theme.mode === 'light'} onclick={() => theme.setMode('light')}>Hell</button>
		</div>
		<p class="lbl">Akzentfarbe</p>
		<div class="swatches">
			{#each ACCENTS as a (a.id)}
				<button class="sw" class:sel={theme.accent === a.id} onclick={() => theme.setAccent(a.id)} title={a.label}>
					<span class="dot" style="background:{a.ember}"></span>
					<span>{a.label}</span>
				</button>
			{/each}
		</div>
		<p class="lbl">Schriftgröße</p>
		<div class="seg">
			{#each densities as d (d.id)}
				<button class:sel={theme.density === d.id} onclick={() => theme.setDensity(d.id)}>{d.label}</button>
			{/each}
		</div>
		<p class="lbl">Sprache / Language</p>
		<div class="seg">
			<button class:sel={i18n.lang === 'de'} onclick={() => i18n.set('de')}>Deutsch</button>
			<button class:sel={i18n.lang === 'en'} onclick={() => i18n.set('en')}>English</button>
		</div>
	</section>

	<!-- KI -->
	<section class="card">
		<h2>KI-Modell</h2>
		<div class="row">
			<div>
				<strong>{engine.status.online ? engine.status.model : 'Nicht verbunden'}</strong>
				<small>{engine.status.detail}</small>
			</div>
			<a class="btn ghost" href="/connections">Verbindungen</a>
		</div>
	</section>

	<!-- Sicherheit -->
	<section class="card">
		<h2>Sicherheit</h2>
		<div class="row">
			<div><strong>Angemeldet als {me?.name ?? '…'}</strong><small>{me?.method === 'tailscale' ? 'via Tailscale' : 'via Passwort'}</small></div>
			<button class="btn ghost" onclick={logout}>Abmelden</button>
		</div>
		<p class="lbl">Passwort ändern</p>
		<input type="password" bind:value={oldPw} placeholder="Aktuelles Passwort" autocomplete="current-password" />
		<input type="password" bind:value={newPw} placeholder="Neues Passwort (min. 8 Zeichen)" autocomplete="new-password" />
		<button class="btn primary" onclick={changePw} disabled={busy}>{busy ? 'Ändere …' : 'Passwort ändern'}</button>
		{#if pwMsg}<div class="msg" class:ok={pwOk}>{pwMsg}</div>{/if}
	</section>

	<!-- Über -->
	<section class="card about">
		<h2>Über</h2>
		<p>Astoris — dein eigener KI-Maschinenraum. Self-hosted, Open-Core.</p>
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
</style>
