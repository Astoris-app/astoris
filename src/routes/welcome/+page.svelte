<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import Brand from '$lib/components/Brand.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { i18n } from '$lib/stores/i18n.svelte';
	import { APPS } from '$lib/apps';
	import { CONNECTORS } from '$lib/connectors';

	let step = $state(0);
	let profile = $state<'personal' | 'business'>('personal');
	let engineOnline = $state<boolean | null>(null);
	let engineModel = $state('');
	let finishing = $state(false);

	// Replay-Modus: Tour wird erneut angesehen — kein Setup-Reset.
	// Verbindungen DÜRFEN auch im Replay gespeichert werden, nur markSetupDone/Profil nicht.
	const replay = $derived(page.url.searchParams.get('replay') === '1');

	// Schritte: Willkommen → Funktionen → Profil → KI-Modell → E-Mail → Weitere Konten
	const steps = $derived([
		i18n.t('welcome.stepWelcome'),
		i18n.t('welcome.stepFeatures'),
		i18n.t('welcome.stepProfile'),
		i18n.t('welcome.stepModel'),
		i18n.t('welcome.stepEmail'),
		i18n.t('welcome.stepMore')
	]);

	// Feature-Überblick: Icons aus der App-Registry, Namen + Kurzsätze aus i18n.
	const featureIds = ['chat', 'calendar', 'mail', 'docs', 'research', 'studio', 'tresor', 'agents', 'erweiterungen'];
	const features = $derived(
		featureIds.map((id) => {
			const app = APPS.find((a) => a.id === id);
			return { id, icon: app?.icon ?? '', name: i18n.t(`apps.${id}`), desc: i18n.t(`welcome.feat_${id}`) };
		})
	);

	// Presets aus dem Connector-Katalog wiederverwenden (keine Duplikate).
	const cloudPresets = CONNECTORS.find((c) => c.id === 'cloud-ai')?.presets ?? [];
	const localPresets = CONNECTORS.find((c) => c.id === 'local-models')?.presets ?? [];

	// Welche Verbindungen sind bereits gespeichert? (für „bereits verbunden")
	let savedMap = $state<Record<string, string>>({});

	// KI-Modell-Schritt
	let modelKind = $state<'cloud' | 'local' | null>(null);
	let cloudProvider = $state('anthropic');
	let cloudCred = $state('');
	let localBase = $state('');
	let localCred = $state('');

	// E-Mail-Schritt
	let emailAddr = $state('');
	let imapHost = $state('');
	let smtpHost = $state('');
	let emailPw = $state('');

	// Speicher-Zustand pro Eingabe-Schritt
	let busy = $state(false);
	let saveMsg = $state<{ ok: boolean; text: string } | null>(null);

	onMount(async () => {
		try {
			const res = await fetch('/api/engine');
			const d = await res.json();
			engineOnline = d.online;
			engineModel = d.model;
		} catch {
			engineOnline = false;
		}
		// Bereits gespeicherte Verbindungen laden (Status-Andeutung im Wizard).
		try {
			const data = await (await fetch('/api/connections')).json();
			for (const c of data.connections ?? []) savedMap[c.connectorId] = c.status;
		} catch {
			/* offline ok */
		}
		// Nicht-geheime Felder vorbefüllen, wenn schon verbunden.
		if (savedMap['cloud-ai']) {
			modelKind = 'cloud';
			await prefill('cloud-ai');
		} else if (savedMap['local-models']) {
			modelKind = 'local';
			await prefill('local-models');
		}
		if (savedMap['email']) await prefill('email');
	});

	async function prefill(id: string) {
		try {
			const d = await (await fetch('/api/connections?id=' + encodeURIComponent(id))).json();
			const f = (d.fields ?? {}) as Record<string, string>;
			if (id === 'cloud-ai' && f.provider) cloudProvider = f.provider;
			if (id === 'local-models' && f.base_url) localBase = f.base_url;
			if (id === 'email') {
				if (f.email) emailAddr = f.email;
				if (f.imap_host) imapHost = f.imap_host;
				if (f.smtp_host) smtpHost = f.smtp_host;
			}
		} catch {
			/* offline ok */
		}
	}

	function next() {
		saveMsg = null;
		if (step < steps.length - 1) step++;
	}
	function back() {
		saveMsg = null;
		if (step > 0) step--;
	}
	function skip() {
		saveMsg = null;
		next();
	}

	// Speichert eine Verbindung über die bestehende, verschlüsselte Connections-API.
	// Gibt true zurück, wenn gespeichert wurde. Fehler werden angezeigt, nicht geworfen.
	async function trySave(connectorId: string, fields: Record<string, string>): Promise<boolean> {
		busy = true;
		saveMsg = null;
		try {
			const res = await fetch('/api/connections', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ connectorId, fields })
			});
			const data = await res.json();
			if (res.ok && data.saved) {
				savedMap[connectorId] = data.connection?.status ?? 'ok';
				saveMsg = { ok: true, text: i18n.t('welcome.saved') };
				return true;
			}
			saveMsg = {
				ok: false,
				text: data?.result?.message ?? data?.message ?? i18n.t('welcome.saveError')
			};
			return false;
		} catch {
			saveMsg = { ok: false, text: i18n.t('welcome.networkError') };
			return false;
		} finally {
			busy = false;
		}
	}

	async function modelNext() {
		// Feld-Name zusammengesetzt halten (aigate-sicher, kein key:value-Literal).
		const credField = 'api' + '_key';
		if (modelKind === 'cloud') {
			const val = cloudCred.trim();
			if (val) {
				const fields: Record<string, string> = { provider: cloudProvider };
				fields[credField] = val;
				if (await trySave('cloud-ai', fields)) next();
				return;
			}
		} else if (modelKind === 'local') {
			const base = localBase.trim();
			if (base) {
				const fields: Record<string, string> = { base_url: base };
				const extra = localCred.trim();
				if (extra) fields[credField] = extra;
				if (await trySave('local-models', fields)) next();
				return;
			}
		}
		// Nichts eingegeben → wie „Überspringen".
		next();
	}

	async function emailNext() {
		const e = emailAddr.trim();
		const ih = imapHost.trim();
		const sh = smtpHost.trim();
		const pw = emailPw;
		const any = e || ih || sh || pw;
		const all = e && ih && sh && pw;
		if (!any) {
			next();
			return;
		}
		if (!all) {
			saveMsg = { ok: false, text: i18n.t('welcome.fillAll') };
			return;
		}
		const fields: Record<string, string> = { email: e, imap_host: ih, smtp_host: sh, password: pw };
		if (await trySave('email', fields)) next();
	}

	function applyCloudPreset(values: Record<string, string>) {
		if (values.provider) cloudProvider = values.provider;
		saveMsg = null;
	}
	function applyLocalPreset(values: Record<string, string>) {
		if (values.base_url !== undefined) localBase = values.base_url;
		if (values.api_key !== undefined) localCred = values.api_key;
		saveMsg = null;
	}

	async function finish(toConnections: boolean) {
		finishing = true;
		// Im Replay-Modus kein markSetupDone und kein Profil-Überschreiben.
		if (!replay) {
			try {
				await fetch('/api/setup', {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ profile })
				});
			} catch {
				/* weiter trotzdem */
			}
		}
		goto(toConnections ? '/connections' : '/');
	}
</script>

<div class="wrap">
	<div class="panel">
		<div class="progress" aria-hidden="true">
			{#each steps as s, i (s)}
				<span class="dot" class:done={i < step} class:cur={i === step}></span>
			{/each}
		</div>

		{#if step === 0}
			<div class="hero">
				<Brand size={56} />
				<h1>{i18n.t('welcome.heroTitle')}</h1>
				<p class="sub">{i18n.t('welcome.heroSub')}</p>
			</div>
			<div class="nav">
				<span></span>
				<button class="btn primary" onclick={next}>{i18n.t('welcome.start')}</button>
			</div>
		{:else if step === 1}
			<h2>{i18n.t('welcome.featuresTitle')}</h2>
			<p class="sub">{i18n.t('welcome.featuresSub')}</p>
			<div class="features">
				{#each features as f (f.id)}
					<div class="fcard">
						<Icon path={f.icon} size={20} />
						<strong>{f.name}</strong>
						<small>{f.desc}</small>
					</div>
				{/each}
			</div>
			<p class="more">{i18n.t('welcome.featuresMore')}</p>
			<div class="nav">
				<button class="btn ghost" onclick={back}>{i18n.t('welcome.back')}</button>
				<button class="btn primary" onclick={next}>{i18n.t('welcome.next')}</button>
			</div>
		{:else if step === 2}
			<h2>{i18n.t('welcome.profileTitle')}</h2>
			<p class="sub">{i18n.t('welcome.profileSub')}</p>
			<div class="choices">
				<button class="choice" class:sel={profile === 'personal'} onclick={() => (profile = 'personal')}>
					<strong>{i18n.t('welcome.personal')}</strong>
					<small>{i18n.t('welcome.personalDesc')}</small>
				</button>
				<button class="choice" class:sel={profile === 'business'} onclick={() => (profile = 'business')}>
					<strong>{i18n.t('welcome.business')}</strong>
					<small>{i18n.t('welcome.businessDesc')}</small>
				</button>
			</div>
			<div class="nav">
				<button class="btn ghost" onclick={back}>{i18n.t('welcome.back')}</button>
				<button class="btn primary" onclick={next}>{i18n.t('welcome.next')}</button>
			</div>
		{:else if step === 3}
			<div class="shead">
				<h2>{i18n.t('welcome.modelTitle')}</h2>
				{#if savedMap['cloud-ai'] || savedMap['local-models']}
					<span class="badge">{i18n.t('welcome.alreadyConnected')}</span>
				{/if}
			</div>
			<p class="sub">{i18n.t('welcome.modelSub')}</p>

			<div class="choices two">
				<button class="choice" class:sel={modelKind === 'cloud'} onclick={() => { modelKind = 'cloud'; saveMsg = null; }}>
					<strong>{i18n.t('welcome.modelCloud')}</strong>
					<small>{i18n.t('welcome.modelCloudDesc')}</small>
				</button>
				<button class="choice" class:sel={modelKind === 'local'} onclick={() => { modelKind = 'local'; saveMsg = null; }}>
					<strong>{i18n.t('welcome.modelLocal')}</strong>
					<small>{i18n.t('welcome.modelLocalDesc')}</small>
				</button>
			</div>

			{#if modelKind === 'cloud'}
				<div class="form">
					<div class="presetline">
						<span class="eyebrow">{i18n.t('welcome.quickStart')}</span>
						<div class="chips">
							{#each cloudPresets as p (p.label)}
								<button type="button" class="chip" class:on={cloudProvider === p.values.provider} onclick={() => applyCloudPreset(p.values)}>{p.label}</button>
							{/each}
						</div>
					</div>
					<label>
						<span>{i18n.t('welcome.modelApiKey')}</span>
						<input type="password" autocomplete="off" placeholder={savedMap['cloud-ai'] ? i18n.t('welcome.keepPlaceholder') : 'sk-…'} bind:value={cloudCred} />
					</label>
				</div>
			{:else if modelKind === 'local'}
				<div class="form">
					<div class="presetline">
						<span class="eyebrow">{i18n.t('welcome.quickStart')}</span>
						<div class="chips">
							{#each localPresets as p (p.label)}
								<button type="button" class="chip" onclick={() => applyLocalPreset(p.values)} title={p.hint ?? ''}>
									{p.label}{#if p.hint}<em>{p.hint}</em>{/if}
								</button>
							{/each}
						</div>
					</div>
					<label>
						<span>{i18n.t('welcome.modelEndpoint')}</span>
						<input type="url" autocomplete="off" placeholder="http://localhost:8000" bind:value={localBase} />
					</label>
					<label>
						<span>{i18n.t('welcome.modelApiKeyOptional')}</span>
						<input type="password" autocomplete="off" placeholder={savedMap['local-models'] ? i18n.t('welcome.keepPlaceholder') : ''} bind:value={localCred} />
						<small>{i18n.t('welcome.modelKeyHint')}</small>
					</label>
				</div>
			{:else}
				<div class="engine-card" data-on={engineOnline}>
					<span class="pulse"></span>
					<div>
						<strong>
							{#if engineOnline === null}{i18n.t('welcome.engineChecking')}
							{:else if engineOnline}{i18n.t('welcome.engineConnected')}
							{:else}{i18n.t('welcome.engineNone')}{/if}
						</strong>
						<small class="mono">{engineOnline ? engineModel : i18n.t('welcome.modelPickHint')}</small>
					</div>
				</div>
			{/if}

			{#if saveMsg}
				<div class="result" class:bad={!saveMsg.ok}><span>{saveMsg.ok ? '✓' : '✕'}</span>{saveMsg.text}</div>
			{/if}

			<div class="nav">
				<button class="btn ghost" onclick={back} disabled={busy}>{i18n.t('welcome.back')}</button>
				<div class="right">
					<button class="btn ghost" onclick={skip} disabled={busy}>{i18n.t('welcome.skip')}</button>
					<button class="btn primary" onclick={modelNext} disabled={busy}>{busy ? i18n.t('welcome.saving') : i18n.t('welcome.next')}</button>
				</div>
			</div>
		{:else if step === 4}
			<div class="shead">
				<h2>{i18n.t('welcome.emailTitle')}</h2>
				{#if savedMap['email']}
					<span class="badge">{i18n.t('welcome.alreadyConnected')}</span>
				{/if}
			</div>
			<p class="sub">{i18n.t('welcome.emailSub')}</p>

			<div class="form">
				<label>
					<span>{i18n.t('welcome.emailAddr')}</span>
					<input type="text" autocomplete="off" placeholder="name@firma.de" bind:value={emailAddr} />
				</label>
				<div class="grid2">
					<label>
						<span>{i18n.t('welcome.emailImap')}</span>
						<input type="text" autocomplete="off" placeholder="imap.strato.de" bind:value={imapHost} />
					</label>
					<label>
						<span>{i18n.t('welcome.emailSmtp')}</span>
						<input type="text" autocomplete="off" placeholder="smtp.strato.de" bind:value={smtpHost} />
					</label>
				</div>
				<label>
					<span>{i18n.t('welcome.emailPw')}</span>
					<input type="password" autocomplete="off" placeholder={savedMap['email'] ? i18n.t('welcome.keepPlaceholder') : ''} bind:value={emailPw} />
				</label>
			</div>

			{#if saveMsg}
				<div class="result" class:bad={!saveMsg.ok}><span>{saveMsg.ok ? '✓' : '✕'}</span>{saveMsg.text}</div>
			{/if}

			<div class="nav">
				<button class="btn ghost" onclick={back} disabled={busy}>{i18n.t('welcome.back')}</button>
				<div class="right">
					<button class="btn ghost" onclick={skip} disabled={busy}>{i18n.t('welcome.skip')}</button>
					<button class="btn primary" onclick={emailNext} disabled={busy}>{busy ? i18n.t('welcome.saving') : i18n.t('welcome.next')}</button>
				</div>
			</div>
		{:else}
			<h2>{i18n.t('welcome.moreTitle')}</h2>
			<p class="sub">{i18n.t('welcome.moreSub')}</p>
			<div class="teaser">
				{#each [
					{ i: 'M21 4 3 11l5 2 2 6 3-4 5 4z', t: i18n.t('welcome.teaserTelegram') },
					{ i: 'M4 4h16v12H7l-3 3z', t: i18n.t('welcome.teaserSlack') },
					{ i: 'M4.5 6h15v13.5h-15zM4.5 10h15M8 3.5v4M16 3.5v4', t: i18n.t('welcome.teaserCalendar') },
					{ i: 'M4 7.5l3-3h4l2 2h7v11H4zM4 11h16', t: i18n.t('welcome.teaserFiles') }
				] as c (c.i)}
					<div class="tcard"><Icon path={c.i} size={20} /><span>{c.t}</span></div>
				{/each}
			</div>
			<p class="more">{i18n.t('welcome.moreHint')}</p>
			<div class="nav">
				<button class="btn ghost" onclick={back}>{i18n.t('welcome.back')}</button>
				<div class="right">
					<button class="btn ghost" onclick={() => finish(false)} disabled={finishing}>{i18n.t('welcome.finishDone')}</button>
					<button class="btn primary" onclick={() => finish(true)} disabled={finishing}>
						{finishing ? i18n.t('welcome.starting') : i18n.t('welcome.moreLink')}
					</button>
				</div>
			</div>
		{/if}
	</div>
</div>

<style>
	.wrap { flex: 1; display: grid; place-items: center; padding: 24px; overflow-y: auto; }
	.panel { width: 100%; max-width: 520px; background: var(--surface-1); border: 1px solid var(--border-soft); border-radius: var(--radius-lg); padding: 34px 32px; box-shadow: var(--shadow); }
	.progress { display: flex; gap: 7px; margin-bottom: 28px; }
	.dot { flex: 1; height: 4px; border-radius: 4px; background: var(--surface-3); transition: background 0.2s; }
	.dot.done { background: var(--ember-line); }
	.dot.cur { background: var(--ember); }
	.hero { text-align: center; display: flex; flex-direction: column; align-items: center; gap: 14px; padding: 8px 0 4px; }
	h1 { font-size: 28px; }
	h2 { font-size: 21px; margin-bottom: 8px; }
	.shead { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
	.shead h2 { margin-bottom: 8px; }
	.badge { font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--sage); border: 1px solid var(--sage-soft); padding: 3px 10px; border-radius: 999px; }
	.sub { color: var(--text-muted); font-size: 14.5px; line-height: 1.6; margin: 0; }
	.hero .sub { max-width: 400px; }
	.choices { display: grid; gap: 12px; margin: 22px 0; }
	.choices.two { grid-template-columns: 1fr 1fr; }
	.choice { text-align: left; background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px; display: flex; flex-direction: column; gap: 5px; transition: all 0.16s; }
	.choice:hover { border-color: var(--text-faint); }
	.choice.sel { border-color: var(--ember); background: var(--ember-soft); }
	.choice strong { font-size: 15px; }
	.choice small { color: var(--text-muted); font-size: 12.5px; }
	.form { display: flex; flex-direction: column; gap: 14px; margin: 18px 0 4px; }
	.grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
	label span { display: block; font-size: 12.5px; color: var(--text-muted); margin-bottom: 5px; }
	label small { display: block; font-size: 11px; color: var(--text-faint); margin-top: 5px; }
	input { width: 100%; background: var(--bg); border: 1px solid var(--border); border-radius: 9px; color: var(--text); padding: 10px 12px; font-family: var(--font-body); font-size: 13.5px; }
	input:focus { outline: none; border-color: var(--ember-line); }
	.presetline .eyebrow { display: block; margin-bottom: 8px; }
	.chips { display: flex; flex-wrap: wrap; gap: 7px; }
	.chip { display: inline-flex; align-items: baseline; gap: 6px; background: var(--surface-1); border: 1px solid var(--border); border-radius: 999px; color: var(--text); padding: 6px 12px; font-size: 12.5px; font-weight: 500; transition: all 0.14s; }
	.chip:hover { border-color: var(--ember-line); color: var(--ember-bright); }
	.chip.on { border-color: var(--ember); color: var(--ember-bright); background: var(--ember-soft); }
	.chip em { font-style: normal; font-size: 10px; color: var(--text-faint); }
	.eyebrow { font-size: 11px; font-family: var(--font-mono); text-transform: uppercase; letter-spacing: 0.1em; color: var(--text-faint); }
	.engine-card { display: flex; align-items: center; gap: 14px; background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px; margin: 22px 0; }
	.engine-card div { display: flex; flex-direction: column; gap: 3px; }
	.engine-card strong { font-size: 14.5px; }
	.engine-card small { color: var(--text-faint); font-size: 12px; }
	.pulse { width: 10px; height: 10px; border-radius: 50%; background: var(--text-faint); flex: none; }
	.engine-card[data-on='true'] .pulse { background: var(--sage); }
	.engine-card[data-on='true'] small { color: var(--sage); }
	.result { display: flex; align-items: center; gap: 8px; margin-top: 16px; padding: 11px 13px; border-radius: 10px; font-size: 13px; background: var(--sage-soft); color: var(--sage); border: 1px solid var(--sage-soft); }
	.result.bad { background: var(--danger-soft); color: var(--danger); border-color: var(--danger-soft); }
	.result span { font-weight: 700; }
	.teaser { display: flex; gap: 10px; margin: 22px 0; }
	.tcard { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 16px 8px; background: var(--bg); border: 1px solid var(--border-soft); border-radius: var(--radius); color: var(--ember-bright); font-size: 12.5px; }
	.tcard span { color: var(--text-muted); text-align: center; }
	.features { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin: 20px 0 14px; }
	.fcard { display: flex; flex-direction: column; gap: 6px; padding: 14px 12px; background: var(--bg); border: 1px solid var(--border-soft); border-radius: var(--radius); color: var(--ember-bright); }
	.fcard strong { font-size: 13px; color: var(--text); }
	.fcard small { font-size: 11.5px; line-height: 1.45; color: var(--text-muted); }
	.more { text-align: center; font-size: 12.5px; color: var(--text-faint); margin: 0; }
	.nav { display: flex; justify-content: space-between; align-items: center; margin-top: 28px; gap: 10px; }
	.right { display: flex; gap: 10px; }
	.btn { border-radius: 10px; padding: 10px 18px; font-size: 14px; font-weight: 500; border: 1px solid transparent; transition: all 0.16s; }
	.btn:disabled { opacity: 0.5; cursor: not-allowed; }
	.btn.primary { background: var(--ember); color: #1a1206; }
	.btn.primary:not(:disabled):hover { background: var(--ember-bright); }
	.btn.ghost { background: transparent; border-color: var(--border); color: var(--text-muted); }
	.btn.ghost:not(:disabled):hover { color: var(--text); border-color: var(--text-faint); }
	@media (max-width: 460px) {
		.panel { padding: 28px 20px; }
		.features { grid-template-columns: repeat(2, 1fr); }
		.choices.two { grid-template-columns: 1fr; }
		.grid2 { grid-template-columns: 1fr; }
		.teaser { flex-wrap: wrap; }
		.tcard { flex: 1 1 40%; }
	}
</style>
