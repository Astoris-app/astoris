// Spracheingabe-Einstellungen: an/aus + Modus (Klick-Umschalten oder Halten zum Sprechen).
class VoiceState {
	enabled = $state(true);
	mode = $state<'toggle' | 'ptt'>('toggle');

	set(enabled: boolean) {
		this.enabled = enabled;
		try { localStorage.setItem('astoris-voice-on', enabled ? '1' : '0'); } catch { /* ignore */ }
	}
	setMode(m: 'toggle' | 'ptt') {
		this.mode = m;
		try { localStorage.setItem('astoris-voice-mode', m); } catch { /* ignore */ }
	}
	init() {
		try {
			if (localStorage.getItem('astoris-voice-on') === '0') this.enabled = false;
			const m = localStorage.getItem('astoris-voice-mode');
			if (m === 'ptt' || m === 'toggle') this.mode = m;
		} catch { /* ignore */ }
	}
}
export const voice = new VoiceState();
