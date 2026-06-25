<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import Brand from '$lib/components/Brand.svelte';
	import Icon from '$lib/components/Icon.svelte';

	let step = $state(0);
	let profile = $state<'personal' | 'business'>('personal');
	let engineOnline = $state<boolean | null>(null);
	let engineModel = $state('');
	let finishing = $state(false);

	const steps = ['Willkommen', 'Profil', 'Maschinenraum', 'Verbindungen'];

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
				<h1>Willkommen bei Astoris</h1>
				<p class="sub">
					Dein eigener KI-Maschinenraum. Ein Arbeitsbereich für dich und deine Firma —
					selbst gehostet, auf deiner Hardware, unter deiner Kontrolle.
				</p>
			</div>
			<div class="nav">
				<span></span>
				<button class="btn primary" onclick={next}>Los geht's</button>
			</div>
		{:else if step === 1}
			<h2>Wofür nutzt du Astoris?</h2>
			<p class="sub">Bestimmt nur, welche Bereiche zuerst sichtbar sind — ändern kannst du es jederzeit.</p>
			<div class="choices">
				<button class="choice" class:sel={profile === 'personal'} onclick={() => (profile = 'personal')}>
					<strong>Persönlich</strong>
					<small>Assistent, E-Mail, Kalender, Dokumente, Recherche.</small>
				</button>
				<button class="choice" class:sel={profile === 'business'} onclick={() => (profile = 'business')}>
					<strong>Firma</strong>
					<small>Zusätzlich: Team-Agenten, Kunden-Workflows, Geschäftskonten.</small>
				</button>
			</div>
			<div class="nav">
				<button class="btn ghost" onclick={back}>Zurück</button>
				<button class="btn primary" onclick={next}>Weiter</button>
			</div>
		{:else if step === 2}
			<h2>Wo deine KI läuft</h2>
			<p class="sub">
				Astoris zeigt jederzeit, wo gerechnet wird. Standardmäßig lokal auf deiner Hardware —
				oder über einen Cloud-Anbieter, falls du keine GPU hast.
			</p>
			<div class="engine-card" data-on={engineOnline}>
				<span class="pulse"></span>
				<div>
					<strong>
						{#if engineOnline === null}Prüfe Maschinenraum …
						{:else if engineOnline}Engine verbunden
						{:else}Noch keine Engine{/if}
					</strong>
					<small class="mono">{engineOnline ? engineModel : 'unter „Verbindungen → KI-Modelle" einrichten'}</small>
				</div>
			</div>
			<div class="nav">
				<button class="btn ghost" onclick={back}>Zurück</button>
				<button class="btn primary" onclick={next}>Weiter</button>
			</div>
		{:else}
			<h2>Deine Konten, von der KI bedient</h2>
			<p class="sub">
				Verbinde E-Mail, Kalender, Modelle und mehr. Die KI darf nur, was du je Verbindung
				erlaubst — Zugangsdaten werden verschlüsselt gespeichert und verlassen nie deinen Server.
			</p>
			<div class="teaser">
				{#each [
					{ i: 'M3.5 6.5h17v11h-17zM3.8 7l8.2 6 8.2-6', t: 'E-Mail' },
					{ i: 'M4.5 6h15v13.5h-15zM4.5 10h15M8 3.5v4M16 3.5v4', t: 'Kalender' },
					{ i: 'M5 5h14v6H5zM5 13h14v6H5zM8 8h.01M8 16h.01', t: 'Modelle' }
				] as c (c.t)}
					<div class="tcard"><Icon path={c.i} size={20} /><span>{c.t}</span></div>
				{/each}
			</div>
			<div class="nav">
				<button class="btn ghost" onclick={back}>Zurück</button>
				<div class="right">
					<button class="btn ghost" onclick={() => finish(false)} disabled={finishing}>Später</button>
					<button class="btn primary" onclick={() => finish(true)} disabled={finishing}>
						{finishing ? 'Starte …' : 'Erste Verbindung einrichten'}
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
