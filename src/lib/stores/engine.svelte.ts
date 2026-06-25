// Reaktiver Engine-Status (Svelte 5 runes). Pollt den Maschinenraum,
// damit die Statusanzeige immer den echten Zustand spiegelt.

import type { EngineStatus } from '$lib/server/engine';

const initial: EngineStatus = { online: false, mode: 'offline', model: 'verbinde …', detail: 'verbinde' };

class EngineState {
	status = $state<EngineStatus>(initial);
	#timer: ReturnType<typeof setInterval> | null = null;

	async refresh() {
		try {
			const res = await fetch('/api/engine');
			if (res.ok) this.status = await res.json();
		} catch {
			this.status = { online: false, mode: 'offline', model: 'keine Engine', detail: 'nicht verbunden' };
		}
	}

	start() {
		if (this.#timer) return;
		this.refresh();
		this.#timer = setInterval(() => this.refresh(), 15000);
	}

	stop() {
		if (this.#timer) clearInterval(this.#timer);
		this.#timer = null;
	}
}

export const engine = new EngineState();
