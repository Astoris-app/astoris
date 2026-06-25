<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import Brand from '$lib/components/Brand.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { i18n } from '$lib/stores/i18n.svelte';

	let step = $state(0);
	let profile = $state<'personal' | 'business'>('personal');
	let engineOnline = $state<boolean | null>(null);
	let engineModel = $state('');
	let finishing = $state(false);

	const steps = $derived([
		i18n.t('welcome.stepWelcome'),
		i18n.t('welcome.stepProfile'),
		i18n.t('welcome.stepEngine'),
		i18n.t('welcome.stepConnections')
	]);

	onMount(async () => {
		try {
			const res = await fetch('/api/engine');
			const d = await res.json();
			engineOnline = d.online;
			engineModel = d.model;
		} catch {
			engineOnline = false;
		}
	});

	function next() {
		if (step < steps.length - 1) step++;
	}
	function back() {
		if (step > 0) step--;
	}

	async function finish(toConnections: boolean) {
		finishing = true;
		try {
			await fetch('/api/setup', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ profile })
			});
		} catch {
			/* weiter trotzdem */
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
		{:else if step === 2}
			<h2>{i18n.t('welcome.engineTitle')}</h2>
			<p class="sub">{i18n.t('welcome.engineSub')}</p>
			<div class="engine-card" data-on={engineOnline}>
				<span class="pulse"></span>
				<div>
					<strong>
						{#if engineOnline === null}{i18n.t('welcome.engineChecking')}
						{:else if engineOnline}{i18n.t('welcome.engineConnected')}
						{:else}{i18n.t('welcome.engineNone')}{/if}
					</strong>
					<small class="mono">{engineOnline ? engineModel : i18n.t('welcome.engineNoneHint')}</small>
				</div>
			</div>
			<div class="nav">
				<button class="btn ghost" onclick={back}>{i18n.t('welcome.back')}</button>
				<button class="btn primary" onclick={next}>{i18n.t('welcome.next')}</button>
			</div>
		{:else}
			<h2>{i18n.t('welcome.connectionsTitle')}</h2>
			<p class="sub">{i18n.t('welcome.connectionsSub')}</p>
			<div class="teaser">
				{#each [
					{ i: 'M3.5 6.5h17v11h-17zM3.8 7l8.2 6 8.2-6', t: i18n.t('welcome.teaserEmail') },
					{ i: 'M4.5 6h15v13.5h-15zM4.5 10h15M8 3.5v4M16 3.5v4', t: i18n.t('welcome.teaserCalendar') },
					{ i: 'M5 5h14v6H5zM5 13h14v6H5zM8 8h.01M8 16h.01', t: i18n.t('welcome.teaserModels') }
				] as c (c.i)}
					<div class="tcard"><Icon path={c.i} size={20} /><span>{c.t}</span></div>
				{/each}
			</div>
			<div class="nav">
				<button class="btn ghost" onclick={back}>{i18n.t('welcome.back')}</button>
				<div class="right">
					<button class="btn ghost" onclick={() => finish(false)} disabled={finishing}>{i18n.t('welcome.later')}</button>
					<button class="btn primary" onclick={() => finish(true)} disabled={finishing}>
						{finishing ? i18n.t('welcome.starting') : i18n.t('welcome.firstConnection')}
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
	.dot { width: 26px; height: 4px; border-radius: 4px; background: var(--surface-3); transition: background 0.2s; }
	.dot.done { background: var(--ember-line); }
	.dot.cur { background: var(--ember); }
	.hero { text-align: center; display: flex; flex-direction: column; align-items: center; gap: 14px; padding: 8px 0 4px; }
	h1 { font-size: 28px; }
	h2 { font-size: 21px; margin-bottom: 8px; }
	.sub { color: var(--text-muted); font-size: 14.5px; line-height: 1.6; margin: 0; }
	.hero .sub { max-width: 400px; }
	.choices { display: grid; gap: 12px; margin: 22px 0; }
	.choice { text-align: left; background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px; display: flex; flex-direction: column; gap: 5px; transition: all 0.16s; }
	.choice:hover { border-color: var(--text-faint); }
	.choice.sel { border-color: var(--ember); background: var(--ember-soft); }
	.choice strong { font-size: 15px; }
	.choice small { color: var(--text-muted); font-size: 12.5px; }
	.engine-card { display: flex; align-items: center; gap: 14px; background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px; margin: 22px 0; }
	.engine-card div { display: flex; flex-direction: column; gap: 3px; }
	.engine-card strong { font-size: 14.5px; }
	.engine-card small { color: var(--text-faint); font-size: 12px; }
	.pulse { width: 10px; height: 10px; border-radius: 50%; background: var(--text-faint); flex: none; }
	.engine-card[data-on='true'] .pulse { background: var(--sage); }
	.engine-card[data-on='true'] small { color: var(--sage); }
	.teaser { display: flex; gap: 10px; margin: 22px 0; }
	.tcard { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 16px 8px; background: var(--bg); border: 1px solid var(--border-soft); border-radius: var(--radius); color: var(--ember-bright); font-size: 12.5px; }
	.tcard span { color: var(--text-muted); }
	.nav { display: flex; justify-content: space-between; align-items: center; margin-top: 28px; }
	.right { display: flex; gap: 10px; }
	.btn { border-radius: 10px; padding: 10px 18px; font-size: 14px; font-weight: 500; border: 1px solid transparent; transition: all 0.16s; }
	.btn:disabled { opacity: 0.5; cursor: not-allowed; }
	.btn.primary { background: var(--ember); color: #1a1206; }
	.btn.primary:not(:disabled):hover { background: var(--ember-bright); }
	.btn.ghost { background: transparent; border-color: var(--border); color: var(--text-muted); }
	.btn.ghost:not(:disabled):hover { color: var(--text); border-color: var(--text-faint); }
</style>
