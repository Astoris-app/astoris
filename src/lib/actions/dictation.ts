// Reusable push-to-talk dictation action for <input>/<textarea>.
//
// Usage:
//   <textarea use:dictation={{ getText: () => text, append: (s) => text = (text ? text + ' ' : '') + s }} />
//
// Behaviour (mirrors the chat composer):
//   - Only active when the voice store is enabled and in 'ptt' mode.
//   - Hold the spacebar while the field is EMPTY to dictate; release to stop.
//   - If the field already has text, the spacebar inserts a normal space.
//   - Listeners live on the element, so only the focused field reacts.
//   - No-op when Web Speech API is missing or the page is not a secure context
//     (HTTP via Tailscale has no microphone access → nothing happens, no errors).
import type { Action } from 'svelte/action';
import { voice } from '$lib/stores/voice.svelte';

export type DictationParams = {
	/** Current text of the field — used to decide empty vs. normal space. */
	getText: () => string;
	/** Called with each recognized chunk; the caller appends it to its state. */
	append: (text: string) => void;
	/** Recognition language (BCP-47). Defaults to de-DE. */
	lang?: string;
};

export const dictation: Action<HTMLElement, DictationParams> = (node, params) => {
	let p = params;
	let recog: any = null;
	let listening = false;
	let supported = false;

	if (typeof window !== 'undefined') {
		const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
		// Microphone needs a secure context (HTTPS). Plain HTTP → stay a no-op.
		if (SR && window.isSecureContext) {
			supported = true;
			recog = new SR();
			recog.lang = p.lang ?? 'de-DE';
			recog.interimResults = false;
			recog.onresult = (e: any) => {
				const transcript = e?.results?.[0]?.[0]?.transcript;
				if (transcript) p.append(transcript);
			};
			recog.onend = () => { listening = false; };
			recog.onerror = () => { listening = false; };
		}
	}

	function onKeyDown(e: KeyboardEvent) {
		if (!supported || !recog) return;
		if (!voice.enabled || voice.mode !== 'ptt') return;
		if (e.code !== 'Space' || e.repeat || listening) return;
		if (p.getText().trim()) return; // field not empty → allow a normal space
		e.preventDefault();
		try { recog.start(); listening = true; } catch { /* already running */ }
	}

	function onKeyUp(e: KeyboardEvent) {
		if (!recog) return;
		if (voice.mode !== 'ptt' || e.code !== 'Space' || !listening) return;
		e.preventDefault();
		try { recog.stop(); } catch { /* ignore */ }
		listening = false;
	}

	// Releasing focus while holding space would otherwise leave recognition running.
	function onBlur() {
		if (listening && recog) { try { recog.stop(); } catch { /* ignore */ } listening = false; }
	}

	node.addEventListener('keydown', onKeyDown);
	node.addEventListener('keyup', onKeyUp);
	node.addEventListener('blur', onBlur);

	return {
		update(next: DictationParams) {
			p = next;
			if (recog && next.lang) recog.lang = next.lang;
		},
		destroy() {
			node.removeEventListener('keydown', onKeyDown);
			node.removeEventListener('keyup', onKeyUp);
			node.removeEventListener('blur', onBlur);
			if (listening && recog) { try { recog.stop(); } catch { /* ignore */ } }
		}
	};
};
