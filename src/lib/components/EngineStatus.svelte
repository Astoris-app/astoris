<script lang="ts">
	// SIGNATURE-ELEMENT: der sichtbare Maschinenraum.
	// Zeigt ehrlich, wo die Intelligenz läuft — das macht Self-Hosting greifbar.
	// Globaler Modell-Status-Badge: auf jeder Seite sichtbar (Rail), Klick → /connections.
	import { engine } from '$lib/stores/engine.svelte';
	import { i18n } from '$lib/stores/i18n.svelte';

	let s = $derived(engine.status);
	let tone = $derived(s.online ? 'live' : 'off');
	let statusWord = $derived(s.online ? i18n.t('engine.active') : i18n.t('engine.offline'));
</script>

<a
	class="engine"
	href="/connections"
	data-tone={tone}
	title={s.online ? `${s.model} · ${s.detail} · ${statusWord}` : i18n.t('engine.offlineHint')}
	aria-label={`${i18n.t('engine.label')}: ${s.model} · ${statusWord}`}
>
	<span class="pulse" aria-hidden="true"></span>
	<div class="meta">
		<span class="model">{s.model}</span>
		<span class="detail mono">{s.detail} · {statusWord}</span>
	</div>
</a>

<style>
	.engine {
		display: flex;
		align-items: center;
		gap: 9px;
		padding: 8px 10px;
		border-radius: var(--radius-sm);
		border: 1px solid var(--border-soft);
		background: var(--surface-1);
		min-width: 0;
		color: var(--text);
		transition: border-color 0.16s, background 0.16s;
	}
	.engine:hover { border-color: var(--ember-line); background: var(--surface-2); }
	.pulse {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		flex: none;
		background: var(--text-faint);
		position: relative;
	}
	.engine[data-tone='live'] .pulse {
		background: var(--sage);
		box-shadow: 0 0 0 0 var(--sage-soft);
		animation: beat 2.6s var(--ease) infinite;
	}
	@keyframes beat {
		0% { box-shadow: 0 0 0 0 rgba(111, 184, 154, 0.4); }
		70% { box-shadow: 0 0 0 7px rgba(111, 184, 154, 0); }
		100% { box-shadow: 0 0 0 0 rgba(111, 184, 154, 0); }
	}
	.meta {
		display: flex;
		flex-direction: column;
		line-height: 1.25;
		min-width: 0;
	}
	.model {
		font-size: 12.5px;
		font-weight: 500;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.detail {
		font-size: 10px;
		color: var(--text-faint);
	}
	.engine[data-tone='live'] .detail {
		color: var(--sage);
	}
</style>
