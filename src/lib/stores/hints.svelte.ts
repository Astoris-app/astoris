// Steuert die Anzeige der Info-Hinweise (i-Icons) app-weit. In Settings abschaltbar.
class HintsState {
	enabled = $state(true);

	toggle() {
		this.enabled = !this.enabled;
		try { localStorage.setItem('astoris-hints', this.enabled ? '1' : '0'); } catch { /* ignore */ }
	}
	set(v: boolean) {
		this.enabled = v;
		try { localStorage.setItem('astoris-hints', v ? '1' : '0'); } catch { /* ignore */ }
	}
	init() {
		try { if (localStorage.getItem('astoris-hints') === '0') this.enabled = false; } catch { /* ignore */ }
	}
}
export const hints = new HintsState();
