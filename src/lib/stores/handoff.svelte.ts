// Übergibt Text vom Chat an den Tresor (client-seitig, überlebt SPA-Navigation).
class HandoffState {
	tresorText = $state('');
	take(): string {
		const t = this.tresorText;
		this.tresorText = '';
		return t;
	}
}
export const handoff = new HandoffState();
