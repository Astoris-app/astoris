<script lang="ts">
	// Stroke-Icon. `path` ist SVG-Path-Data aus der App-Registry.
	let { path, size = 22 }: { path: string; size?: number } = $props();
</script>

<svg
	width={size}
	height={size}
	viewBox="0 0 24 24"
	fill="none"
	stroke="currentColor"
	stroke-width="1.6"
	stroke-linecap="round"
	stroke-linejoin="round"
	aria-hidden="true"
>
	<path d={path} />
</svg>
