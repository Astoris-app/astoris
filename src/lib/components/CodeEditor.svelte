<script lang="ts">
	let { value = $bindable(''), placeholder = '' }: { value?: string; placeholder?: string } = $props();
	let ta = $state<HTMLTextAreaElement>();
	let gutter = $state<HTMLDivElement>();
	let lineCount = $derived(Math.max(1, value.split('\n').length));

	function onKey(e: KeyboardEvent) {
		if (e.key === 'Tab') {
			e.preventDefault();
			const t = ta;
			if (!t) return;
			const s = t.selectionStart;
			const en = t.selectionEnd;
			value = value.slice(0, s) + '  ' + value.slice(en);
			requestAnimationFrame(() => { t.selectionStart = t.selectionEnd = s + 2; });
		}
	}
	function syncScroll() {
		if (gutter && ta) gutter.scrollTop = ta.scrollTop;
	}
</script>

<div class="ed">
	<div class="gutter" bind:this={gutter} aria-hidden="true">
		{#each Array(lineCount) as _, i}<div>{i + 1}</div>{/each}
	</div>
	<textarea
		bind:this={ta}
		bind:value
		onkeydown={onKey}
		onscroll={syncScroll}
		{placeholder}
		spellcheck="false"
		autocomplete="off"
		autocapitalize="off"
	></textarea>
</div>

<style>
	.ed {
		display: flex;
		background: #16110a;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		overflow: hidden;
		font-family: var(--font-mono, ui-monospace, monospace);
		font-size: 13px;
		line-height: 1.55;
	}
	:global(:root[data-theme='light']) .ed { background: #2b2419; }
	.gutter {
		flex: none;
		padding: 12px 0;
		width: 44px;
		text-align: right;
		color: #5c5141;
		background: rgba(0, 0, 0, 0.2);
		user-select: none;
		overflow: hidden;
	}
	.gutter div { padding: 0 10px 0 0; }
	textarea {
		flex: 1;
		padding: 12px 14px;
		border: none;
		background: transparent;
		color: #e9ddca;
		resize: vertical;
		min-height: 240px;
		font: inherit;
		tab-size: 2;
		white-space: pre;
		overflow-wrap: normal;
		outline: none;
	}
	textarea::placeholder { color: #6b5f4c; }
</style>
