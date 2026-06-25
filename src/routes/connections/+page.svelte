<script lang="ts">
	import { onMount } from 'svelte';
	import AppHeader from '$lib/components/AppHeader.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { i18n } from '$lib/stores/i18n.svelte';
	import { CONNECTORS, type Connector } from '$lib/connectors';

	type Status = 'ok' | 'error' | 'untested';
	let saved = $state<Record<string, Status>>({});

	let active = $state<Connector | null>(null);
	let fieldVals = $state<Record<string, string>>({});
	let scopeState = $state<Record<string, boolean>>({});
	let testing = $state(false);
	let showPw = $state<Record<string, boolean>>({});
	let tsActive = $state(false);
	let result = $state<{ ok: boolean; message: string; skipped?: boolean } | null>(null);

	let categories = $derived([...new Set(CONNECTORS.map((c) => c.category))]);

	async function load() {
		try {
			const res = await fetch('/api/connections');
			const data = await res.json();
			const map: Record<string, Status> = {};
			for (const c of data.connections) map[c.connectorId] = c.status;
			saved = map;
		} catch {
			/* offline ok */
		}
		try {
			const a = await (await fetch('/api/auth')).json();
			tsActive = a.user?.method === 'tailscale';
		} catch { /* ignore */ }
	}
	onMount(load);

	async function open(c: Connector) {
		active = c;
		result = null;
		showPw = {};
		fieldVals = Object.fromEntries(c.fields.map((f) => [f.key, '']));
		scopeState = Object.fromEntries(c.scopes.map((s) => [s.id, s.default]));
		// Beim Bearbeiten gespeicherte (Nicht-Passwort-)Werte vorausfüllen.
		if (saved[c.id]) {
			try {
				const d = await (await fetch('/api/connections?id=' + encodeURIComponent(c.id))).json();
				for (const [k, v] of Object.entries(d.fields ?? {})) fieldVals[k] = v as string;
				if (d.scopes) for (const sc of c.scopes) if (sc.id in d.scopes) scopeState[sc.id] = d.scopes[sc.id];
			} catch { /* offline ok */ }
		}
	}
	function close() {
		active = null;
		result = null;
	}

	async function submit(testOnly: boolean) {
		if (!active || testing) return;
		testing = true;
		result = null;
		try {
			const res = await fetch('/api/connections', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ connectorId: active.id, fields: fieldVals, scopes: scopeState, testOnly })
			});
			const data = await res.json();
			if (!res.ok) {
				result = { ok: false, message: data.message ?? i18n.t('connections.error') };
			} else {
				result = data.result;
				if (!testOnly && data.saved) {
					await load();
					setTimeout(close, 900);
				}
			}
		} catch {
			result = { ok: false, message: i18n.t('connections.networkError') };
		} finally {
			testing = false;
		}
	}

	async function disconnect(id: string) {
		await fetch(`/api/connections?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
		await load();
	}
</script>

<AppHeader title={i18n.t('connections.title')} eyebrow={i18n.t('connections.eyebrow')} />

<div class="scroll">
	<p class="lead">
		{i18n.t('connections.lead')}
	</p>

	<div class="tscard" id="ts-top" class:on={tsActive}>
		<div class="tstop">
			<div class="tsico">
				<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="5" r="2"/><circle cx="12" cy="5" r="2" opacity="0.35"/><circle cx="19" cy="5" r="2"/><circle cx="5" cy="12" r="2" opacity="0.35"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2" opacity="0.35"/><circle cx="5" cy="19" r="2"/><circle cx="12" cy="19" r="2" opacity="0.35"/><circle cx="19" cy="19" r="2"/></svg>
			</div>
			<div class="tsinfo">
				<h3>{i18n.t('connections.tailscaleTitle')}</h3>
				<p>{i18n.t('connections.tailscaleDesc')}</p>
			</div>
			{#if tsActive}<span class="tsstate on">{i18n.t('connections.tailscaleActive')}</span>{/if}
		</div>
		{#if !tsActive}
			<div class="tssteps">
				<span class="tshow">{i18n.t('connections.tailscaleHow')}</span>
				<ol>
					<li>{i18n.t('connections.tailscaleStep1')}</li>
					<li>{i18n.t('connections.tailscaleStep2')}</li>
					<li>{i18n.t('connections.tailscaleStep3')}</li>
				</ol>
			</div>
		{/if}
	</div>

	{#each categories as cat (cat)}
		<section>
			<h2 class="cat">{cat}</h2>
			<div class="grid">
				{#each CONNECTORS.filter((c) => c.category === cat) as c (c.id)}
					<article class="card" class:on={saved[c.id] === 'ok'} class:warn={saved[c.id] === 'untested'}>
						<div class="top">
							<div class="ico"><Icon path={c.icon} size={20} /></div>
							{#if saved[c.id] === 'ok'}
								<span class="state ok mono">{i18n.t('connections.connected')}</span>
							{:else if saved[c.id] === 'untested'}
								<span class="state warn mono">{i18n.t('connections.active')}</span>
							{/if}
						</div>
						<h3>{c.name}</h3>
						<p>{c.blurb}</p>
						<div class="actions">
							{#if saved[c.id]}
								<button class="btn ghost" onclick={() => disconnect(c.id)}>{i18n.t('connections.disconnect')}</button>
								<button class="btn ghost" onclick={() => open(c)}>{i18n.t('connections.edit')}</button>
							{:else}
								<button class="btn primary" onclick={() => open(c)}>{i18n.t('connections.connect')}</button>
							{/if}
						</div>
					</article>
				{/each}
			</div>
		</section>
	{/each}

	<section>
		<h2 class="cat">{i18n.t('connections.access')}</h2>
		<div class="grid">
			<article class="card" class:on={tsActive}>
				<div class="top">
					<div class="ico"><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="5" r="2"/><circle cx="12" cy="5" r="2" opacity="0.35"/><circle cx="19" cy="5" r="2"/><circle cx="5" cy="12" r="2" opacity="0.35"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2" opacity="0.35"/><circle cx="5" cy="19" r="2"/><circle cx="12" cy="19" r="2" opacity="0.35"/><circle cx="19" cy="19" r="2"/></svg></div>
					{#if tsActive}<span class="state ok mono">{i18n.t('connections.tailscaleActive')}</span>{/if}
				</div>
				<h3>{i18n.t('connections.tailscaleTitle')}</h3>
				<p>{i18n.t('connections.tailscaleShort')}</p>
				<div class="actions">
					<button class="btn ghost" onclick={() => document.getElementById('ts-top')?.scrollIntoView({ behavior: 'smooth' })}>{i18n.t('connections.tailscaleGuide')}</button>
				</div>
			</article>
		</div>
	</section>
</div>

{#if active}
	<div class="overlay" role="button" tabindex="0" onclick={close} onkeydown={(e) => e.key === 'Escape' && close()}>
		<div
			class="dialog"
			role="dialog"
			aria-modal="true"
			aria-label="{active.name} {i18n.t('connections.connectTitle')}"
			tabindex="-1"
			onclick={(e) => e.stopPropagation()}
			onkeydown={() => {}}
		>
			<div class="dhead">
				<div class="ico"><Icon path={active.icon} size={20} /></div>
				<div>
					<h3>{active.name} {i18n.t('connections.connectTitle')}</h3>
					<span class="eyebrow">{active.category}</span>
				</div>
			</div>

			<div class="fields">
				{#each active.fields as f (f.key)}
					<label>
						<span>{f.label}{#if f.optional}<em class="opt">{i18n.t('connections.optional')}</em>{/if}</span>
						{#if f.type === 'password'}
							<div class="pwwrap">
								<input
									type={showPw[f.key] ? 'text' : 'password'}
									placeholder={saved[active.id] ? '•••••••• (leer = unverändert)' : (f.placeholder ?? '')}
									bind:value={fieldVals[f.key]}
									autocomplete="off"
								/>
								<button type="button" class="eye" onclick={() => (showPw[f.key] = !showPw[f.key])} aria-label={showPw[f.key] ? 'Passwort verbergen' : 'Passwort anzeigen'}>
									{#if showPw[f.key]}
										<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9.9 4.2A10.9 10.9 0 0 1 12 4c6.5 0 10 7 10 7a18 18 0 0 1-3 3.8M6.5 6.5A18 18 0 0 0 2 11s3.5 7 10 7a10.9 10.9 0 0 0 3.5-.6M3 3l18 18M9.5 9.5a3 3 0 0 0 4.2 4.2"/></svg>
									{:else}
										<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>
									{/if}
								</button>
							</div>
						{:else}
							<input
								type="text"
								placeholder={f.placeholder ?? ''}
								bind:value={fieldVals[f.key]}
								autocomplete="off"
							/>
						{/if}
						{#if f.hint}<small>{f.hint}</small>{/if}
					</label>
				{/each}
			</div>

			<div class="perms">
				<span class="eyebrow">{i18n.t('connections.permissions')}</span>
				{#each active.scopes as s (s.id)}
					<label class="perm">
						<input type="checkbox" bind:checked={scopeState[s.id]} />
						<span class="pl">
							{s.label}
							{#if s.sensitive}<em>{i18n.t('connections.sensitive')}</em>{/if}
						</span>
					</label>
				{/each}
			</div>

			{#if result}
				<div class="result" class:bad={!result.ok}>
					<span>{result.ok ? (result.skipped ? 'ℹ' : '✓') : '✕'}</span>
					{result.message}
				</div>
			{/if}

			<div class="dactions">
				<button class="btn ghost" onclick={() => submit(true)} disabled={testing}>
					{testing ? i18n.t('connections.testing') : i18n.t('connections.test')}
				</button>
				<button class="btn primary" onclick={() => submit(false)} disabled={testing}>
					{testing ? i18n.t('connections.checking') : i18n.t('connections.connectSave')}
				</button>
			</div>
			<p class="hint mono">{i18n.t('connections.credsNote')}</p>
		</div>
	</div>
{/if}

<style>
	.scroll { flex: 1; overflow-y: auto; padding: 24px 28px 40px; }
	.lead { color: var(--text-muted); max-width: 640px; margin: 0 0 22px; }
	.tscard { display: flex; flex-direction: column; background: var(--surface-1); border: 1px solid var(--border-soft); border-radius: var(--radius); padding: 18px 20px; margin-bottom: 28px; }
	.tscard.on { box-shadow: inset 2px 0 0 var(--sage); }
	.tstop { display: flex; align-items: center; gap: 16px; }
	.tsico { width: 46px; height: 46px; flex: none; display: grid; place-items: center; border-radius: 12px; color: var(--ember-bright); background: var(--ember-soft); }
	.tsinfo { flex: 1; min-width: 0; }
	.tsinfo h3 { font-size: 15.5px; margin-bottom: 4px; }
	.tsinfo p { margin: 0; font-size: 13px; color: var(--text-muted); }
	.tsstate { flex: none; font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--sage); border: 1px solid var(--sage-soft); padding: 4px 11px; border-radius: 999px; }
	.tssteps { margin-top: 16px; padding-top: 14px; border-top: 1px solid var(--border-soft); }
	.tshow { font-size: 12px; font-weight: 600; color: var(--text); display: block; margin-bottom: 10px; }
	.tssteps ol { margin: 0; padding: 0; list-style: none; counter-reset: ts; display: flex; flex-direction: column; gap: 8px; }
	.tssteps li { position: relative; padding-left: 30px; font-size: 13px; color: var(--text-muted); counter-increment: ts; line-height: 1.45; }
	.tssteps li::before { content: counter(ts); position: absolute; left: 0; top: 0; width: 20px; height: 20px; display: grid; place-items: center; border-radius: 50%; background: var(--ember-soft); color: var(--ember-bright); font-size: 11px; font-weight: 600; }
	.cat { font-size: 13px; font-family: var(--font-mono); text-transform: uppercase; letter-spacing: 0.12em; color: var(--text-faint); margin: 26px 0 12px; }
	.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 12px; }
	.card { background: var(--surface-1); border: 1px solid var(--border-soft); border-radius: var(--radius); padding: 16px; display: flex; flex-direction: column; gap: 8px; transition: border-color 0.18s, transform 0.18s var(--ease); }
	.card:hover { transform: translateY(-2px); border-color: var(--border); }
	.card.on { box-shadow: inset 2px 0 0 var(--sage); }
	.card.warn { box-shadow: inset 2px 0 0 var(--ember); }
	.top { display: flex; align-items: center; justify-content: space-between; }
	.ico { width: 38px; height: 38px; display: grid; place-items: center; border-radius: 10px; color: var(--ember-bright); background: var(--ember-soft); }
	.state { font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em; }
	.state.ok { color: var(--sage); }
	.state.warn { color: var(--ember-bright); }
	.card h3 { font-size: 15.5px; }
	.card p { margin: 0; font-size: 13px; color: var(--text-muted); flex: 1; }
	.actions { display: flex; gap: 8px; margin-top: 4px; }
	.btn { border-radius: 9px; padding: 8px 13px; font-size: 13px; font-weight: 500; border: 1px solid transparent; transition: all 0.16s; }
	.btn:disabled { opacity: 0.5; cursor: not-allowed; }
	.btn.primary { background: var(--ember); color: #1a1206; }
	.btn.primary:not(:disabled):hover { background: var(--ember-bright); }
	.btn.ghost { background: transparent; border-color: var(--border); color: var(--text-muted); }
	.btn.ghost:not(:disabled):hover { color: var(--text); border-color: var(--text-faint); }

	.overlay { position: fixed; inset: 0; background: rgba(8, 6, 4, 0.66); backdrop-filter: blur(3px); display: grid; place-items: center; padding: 20px; z-index: 100; }
	.dialog { width: 100%; max-width: 440px; max-height: 88vh; overflow-y: auto; background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 22px; box-shadow: var(--shadow); }
	.dhead { display: flex; align-items: center; gap: 12px; margin-bottom: 18px; }
	.dhead h3 { font-size: 16px; }
	.fields { display: flex; flex-direction: column; gap: 12px; }
	label span { display: block; font-size: 12.5px; color: var(--text-muted); margin-bottom: 5px; }
	label small { display: block; font-size: 11px; color: var(--text-faint); margin-top: 5px; }
	.opt { font-style: normal; font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-faint); margin-left: 8px; }
	input[type='text'], input[type='password'] { width: 100%; background: var(--bg); border: 1px solid var(--border); border-radius: 9px; color: var(--text); padding: 10px 12px; font-family: var(--font-body); font-size: 13.5px; }
	input[type='text']:focus, input[type='password']:focus { outline: none; border-color: var(--ember-line); }
	.pwwrap { position: relative; display: flex; align-items: center; }
	.pwwrap input { padding-right: 42px; }
	.eye { position: absolute; right: 7px; width: 30px; height: 30px; display: grid; place-items: center; border: none; background: transparent; color: var(--text-faint); border-radius: 7px; transition: color 0.14s; }
	.eye:hover { color: var(--text); }
	.perms { margin-top: 20px; display: flex; flex-direction: column; gap: 4px; }
	.perms .eyebrow { margin-bottom: 6px; display: block; }
	.perm { display: flex; align-items: center; gap: 10px; padding: 9px 10px; border-radius: 9px; cursor: pointer; transition: background 0.14s; }
	.perm:hover { background: var(--surface-1); }
	.perm input { width: 16px; height: 16px; accent-color: var(--ember); }
	.pl { font-size: 13.5px; }
	.pl em { font-style: normal; font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--danger); margin-left: 8px; border: 1px solid var(--danger-soft); padding: 1px 6px; border-radius: 999px; }
	.result { display: flex; align-items: center; gap: 8px; margin-top: 16px; padding: 11px 13px; border-radius: 10px; font-size: 13px; background: var(--sage-soft); color: var(--sage); border: 1px solid var(--sage-soft); }
	.result.bad { background: var(--danger-soft); color: var(--danger); border-color: var(--danger-soft); }
	.result span { font-weight: 700; }
	.dactions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px; }
	.hint { text-align: center; font-size: 10.5px; color: var(--text-faint); margin: 14px 0 0; }
</style>
