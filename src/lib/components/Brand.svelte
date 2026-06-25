<script lang="ts">
	// Astoris-Mark: eine aufgehende Glut ("Nova") — radialer Kern, der nach außen
	// erkaltet. Eigenständig, kein generischer AI-Funke.
	let { size = 30 }: { size?: number } = $props();
</script>

<svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-label="Astoris">
	<defs>
		<radialGradient id="nova-core" cx="50%" cy="46%" r="58%">
			<stop offset="0%" stop-color="#ffd9a8" />
			<stop offset="42%" stop-color="#f59a55" />
			<stop offset="100%" stop-color="#d9641f" />
		</radialGradient>
	</defs>
	<circle cx="16" cy="16" r="11" fill="url(#nova-core)" />
	<!-- Erkaltende Sichel: dunkler Bogen über dem Kern -->
	<path d="M16 5 A11 11 0 0 1 16 27 A8.5 8.5 0 0 0 16 5 Z" fill="var(--bg)" opacity="0.55" />
	<circle cx="16" cy="16" r="11" stroke="var(--ember-line)" stroke-width="1" />
</svg>
