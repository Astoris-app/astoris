<script lang="ts">
	import AppHeader from '$lib/components/AppHeader.svelte';

	// Image analysis MVP. Bildgenerierung (FLUX) folgt in Verfeinerung.
	let imageData = $state<string | null>(null); // data URL
	let fileName = $state('');
	let prompt = $state('');
	let loading = $state(false);
	let result = $state('');
	let errMsg = $state('');
	let dragging = $state(false);
	let fileInput = $state<HTMLInputElement | null>(null);

	function readFile(file: File) {
		if (!file.type.startsWith('image/')) {
			errMsg = 'Bitte eine Bilddatei wählen.';
			return;
		}
		errMsg = '';
		result = '';
		fileName = file.name;
		const reader = new FileReader();
		reader.onload = () => {
			imageData = String(reader.result);
		};
		reader.onerror = () => {
			errMsg = 'Bild konnte nicht gelesen werden.';
		};
		reader.readAsDataURL(file);
	}

	function onPick(e: Event) {
		const file = (e.target as HTMLInputElement).files?.[0];
		if (file) readFile(file);
	}

	function onDrop(e: DragEvent) {
		e.preventDefault();
		dragging = false;
		const file = e.dataTransfer?.files?.[0];
		if (file) readFile(file);
	}

	function reset() {
		imageData = null;
		fileName = '';
		result = '';
		errMsg = '';
		if (fileInput) fileInput.value = '';
	}

	async function analyze() {
		if (!imageData || loading) return;
		loading = true;
		errMsg = '';
		result = '';
		try {
			const res = await fetch('/api/studio', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ image: imageData, prompt })
			});
			const data = await res.json();
			if (!res.ok || data.error) {
				errMsg = data.error ?? 'Analyse fehlgeschlagen.';
			} else {
				result = data.description ?? '';
			}
		} catch {
			errMsg = 'Verbindung fehlgeschlagen.';
		} finally {
			loading = false;
		}
	}
</script>

<AppHeader title="Studio" eyebrow="Bild-Analyse" />

<div class="scroll">
	<div class="inner">
		<input
			bind:this={fileInput}
			type="file"
			accept="image/*"
			onchange={onPick}
			hidden
		/>

		{#if !imageData}
			<!-- Empty state: prompt the user to upload an image -->
			<button
				type="button"
				class="drop"
				class:dragging
				onclick={() => fileInput?.click()}
				ondragover={(e) => {
					e.preventDefault();
					dragging = true;
				}}
				ondragleave={() => (dragging = false)}
				ondrop={onDrop}
			>
				<svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
					<path d="M3.5 6.5h17v13h-17z" />
					<path d="M7 11.5a1.6 1.6 0 1 0 0-3.2 1.6 1.6 0 0 0 0 3.2zM3.5 17l5-5 4 4 3-3 5 5" />
				</svg>
				<span class="dtitle">Bild hochladen</span>
				<span class="dhint">Klicken oder Datei hierher ziehen</span>
			</button>
		{:else}
			<div class="preview">
				<img src={imageData} alt={fileName || 'Vorschau'} />
				<div class="prow">
					<span class="fname">{fileName}</span>
					<button type="button" class="mini" onclick={reset}>Entfernen</button>
				</div>
			</div>

			<label class="field">
				<span>Was möchtest du wissen? <em>(optional)</em></span>
				<textarea
					bind:value={prompt}
					rows="2"
					placeholder="Beschreibe dieses Bild detailliert."
				></textarea>
			</label>

			<button class="run" onclick={analyze} disabled={loading}>
				{loading ? 'Analysiere …' : 'Analysieren'}
			</button>
		{/if}

		{#if errMsg}<div class="msg bad">{errMsg}</div>{/if}

		{#if loading}
			<div class="result skeleton">
				<span class="bar"></span>
				<span class="bar"></span>
				<span class="bar short"></span>
			</div>
		{:else if result}
			<div class="result">
				<div class="rhead"><span class="eyebrow">Beschreibung</span></div>
				<p class="out">{result}</p>
			</div>
		{/if}
	</div>
</div>

<style>
	.scroll {
		flex: 1;
		overflow-y: auto;
		padding: 24px 28px 40px;
	}
	.inner {
		max-width: 720px;
		width: 100%;
		margin: 0 auto;
	}

	/* Upload / empty state */
	.drop {
		width: 100%;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 8px;
		padding: 56px 24px;
		background: var(--surface-1);
		border: 1.5px dashed var(--border);
		border-radius: var(--radius-lg);
		color: var(--text-faint);
		transition: all 0.16s;
		cursor: pointer;
	}
	.drop:hover,
	.drop.dragging {
		border-color: var(--ember-line);
		color: var(--ember-bright);
		background: var(--ember-soft);
	}
	.dtitle {
		font-size: 15px;
		font-weight: 500;
		color: var(--text);
	}
	.dhint {
		font-size: 12.5px;
		color: var(--text-muted);
	}

	/* Preview */
	.preview {
		margin-bottom: 18px;
		border: 1px solid var(--border-soft);
		border-radius: var(--radius);
		overflow: hidden;
		background: var(--bg-veil);
	}
	.preview img {
		display: block;
		width: 100%;
		max-height: 380px;
		object-fit: contain;
		background: var(--bg);
	}
	.prow {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 9px 13px;
	}
	.fname {
		font-family: var(--font-mono);
		font-size: 12px;
		color: var(--ember-bright);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	/* Prompt field */
	.field {
		display: block;
		margin-bottom: 16px;
	}
	.field span {
		display: block;
		font-size: 12.5px;
		color: var(--text-muted);
		margin-bottom: 6px;
	}
	.field em {
		font-style: normal;
		color: var(--text-faint);
	}
	textarea {
		width: 100%;
		background: var(--surface-1);
		border: 1px solid var(--border);
		border-radius: 10px;
		color: var(--text);
		padding: 11px 13px;
		font-family: var(--font-body);
		font-size: 14px;
		resize: vertical;
	}
	textarea:focus {
		outline: none;
		border-color: var(--ember-line);
	}

	/* Buttons */
	.run {
		width: 100%;
		background: var(--ember);
		color: #1a1206;
		border: none;
		border-radius: 11px;
		padding: 13px;
		font-size: 14.5px;
		font-weight: 500;
		transition: all 0.16s;
	}
	.run:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.run:not(:disabled):hover {
		background: var(--ember-bright);
	}
	.mini {
		font-size: 12px;
		color: var(--text-muted);
		background: var(--surface-1);
		border: 1px solid var(--border-soft);
		border-radius: 7px;
		padding: 5px 11px;
		transition: all 0.16s;
		flex: none;
	}
	.mini:hover {
		color: var(--text);
		border-color: var(--ember-line);
	}

	/* Messages & result */
	.msg {
		margin-top: 16px;
		padding: 11px 13px;
		border-radius: 10px;
		font-size: 13px;
	}
	.msg.bad {
		background: var(--surface-2);
		border: 1px solid var(--border-soft);
		color: var(--danger);
	}
	.result {
		margin-top: 22px;
	}
	.rhead {
		margin-bottom: 8px;
	}
	.out {
		background: var(--bg-veil);
		border: 1px solid var(--border-soft);
		border-radius: 10px;
		padding: 15px;
		font-size: 14px;
		line-height: 1.6;
		color: var(--text);
		white-space: pre-wrap;
		margin: 0;
	}

	/* Loading skeleton */
	.skeleton {
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding: 15px;
		background: var(--bg-veil);
		border: 1px solid var(--border-soft);
		border-radius: 10px;
	}
	.bar {
		height: 11px;
		border-radius: 6px;
		background: var(--surface-3);
		animation: pulse 1.3s ease-in-out infinite;
	}
	.bar.short {
		width: 55%;
	}
	@keyframes pulse {
		0%,
		100% {
			opacity: 0.4;
		}
		50% {
			opacity: 0.85;
		}
	}
</style>
