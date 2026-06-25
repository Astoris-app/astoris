// Live-Theming: Akzentfarbe + Dichte. Überschreibt CSS-Variablen zur Laufzeit,
// persistiert in localStorage. Svelte 5 Runes.

export type Accent = { id: string; label: string; ember: string; bright: string; soft: string; line: string };

export const ACCENTS: Accent[] = [
	{ id: 'glut', label: 'Glut', ember: '#e8843c', bright: '#f59a55', soft: 'rgba(232,132,60,0.13)', line: 'rgba(232,132,60,0.32)' },
	{ id: 'bernstein', label: 'Bernstein', ember: '#d9a441', bright: '#ecc46a', soft: 'rgba(217,164,65,0.13)', line: 'rgba(217,164,65,0.32)' },
	{ id: 'salbei', label: 'Salbei', ember: '#6fb89a', bright: '#8ccfb3', soft: 'rgba(111,184,154,0.13)', line: 'rgba(111,184,154,0.32)' },
	{ id: 'ozean', label: 'Ozean', ember: '#4a9fd9', bright: '#6db8ec', soft: 'rgba(74,159,217,0.13)', line: 'rgba(74,159,217,0.32)' },
	{ id: 'amethyst', label: 'Amethyst', ember: '#9a7fd9', bright: '#b39bec', soft: 'rgba(154,127,217,0.13)', line: 'rgba(154,127,217,0.32)' },
	{ id: 'koralle', label: 'Koralle', ember: '#e0685f', bright: '#ee847c', soft: 'rgba(224,104,95,0.13)', line: 'rgba(224,104,95,0.32)' }
];

const DENSITIES: Record<string, string> = { kompakt: '13.5px', normal: '15px', gross: '16.5px' };

class ThemeState {
	accent = $state('glut');
	density = $state('normal');
	mode = $state<'dark' | 'light'>('dark');

	apply() {
		if (typeof document === 'undefined') return;
		const a = ACCENTS.find((x) => x.id === this.accent) ?? ACCENTS[0];
		const r = document.documentElement.style;
		r.setProperty('--ember', a.ember);
		r.setProperty('--ember-bright', a.bright);
		r.setProperty('--ember-soft', a.soft);
		r.setProperty('--ember-line', a.line);
		document.body.style.fontSize = DENSITIES[this.density] ?? DENSITIES.normal;
		document.documentElement.setAttribute('data-theme', this.mode);
	}

	setAccent(id: string) {
		this.accent = id;
		try { localStorage.setItem('astoris-accent', id); } catch { /* ignore */ }
		this.apply();
	}
	setMode(m: 'dark' | 'light') {
		this.mode = m;
		try { localStorage.setItem('astoris-mode', m); } catch { /* ignore */ }
		this.apply();
	}
	setDensity(id: string) {
		this.density = id;
		try { localStorage.setItem('astoris-density', id); } catch { /* ignore */ }
		this.apply();
	}

	init() {
		try {
			this.accent = localStorage.getItem('astoris-accent') ?? 'glut';
			this.density = localStorage.getItem('astoris-density') ?? 'normal';
			const m = localStorage.getItem('astoris-mode'); if (m === 'light' || m === 'dark') this.mode = m;
		} catch { /* ignore */ }
		this.apply();
	}
}

export const theme = new ThemeState();
