// Aktive Sprache + Übersetzungsfunktion (Svelte 5 Runes).
import { dict, type Lang } from '$lib/i18n/dict';

class I18nState {
	lang = $state<Lang>('de');

	t(key: string): string {
		const parts = key.split('.');
		let cur: unknown = dict[this.lang];
		for (const p of parts) cur = (cur as Record<string, unknown>)?.[p];
		return (typeof cur === 'string' ? cur : key);
	}

	set(lang: Lang) {
		this.lang = lang;
		try { localStorage.setItem('astoris-lang', lang); } catch { /* ignore */ }
		if (typeof document !== 'undefined') document.documentElement.lang = lang;
	}

	init() {
		try {
			const saved = localStorage.getItem('astoris-lang') as Lang | null;
			if (saved === 'de' || saved === 'en') this.lang = saved;
			else if (typeof navigator !== 'undefined') this.lang = navigator.language?.toLowerCase().startsWith('de') ? 'de' : 'en';
		} catch { /* ignore */ }
		if (typeof document !== 'undefined') document.documentElement.lang = this.lang;
	}
}

export const i18n = new I18nState();
