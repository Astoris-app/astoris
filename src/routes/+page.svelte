<script lang="ts">
	import { onMount, tick } from 'svelte';
	import AppHeader from '$lib/components/AppHeader.svelte';
	import { renderMarkdown } from '$lib/markdown';
	import ChatSidebar from '$lib/components/ChatSidebar.svelte';
	import CryptChat from '$lib/components/CryptChat.svelte';
	import { i18n } from '$lib/stores/i18n.svelte';
	import { goto } from '$app/navigation';
	import { handoff } from '$lib/stores/handoff.svelte';
	import { voice } from '$lib/stores/voice.svelte';
	import { assistant } from '$lib/stores/assistant.svelte';

	type Msg = {
		role: 'user' | 'assistant';
		text: string;
		reasoning?: string;
		tools?: string[];
		model?: string;
		ms?: number;
		time?: string;
		demo?: boolean;
		error?: boolean;
		streaming?: boolean;
	};

	let messages = $state<Msg[]>(assistant.messages as Msg[]);
	let draft = $state(assistant.draft);
	let busy = $state(false);
	let scroller: HTMLDivElement;
	let ta = $state<HTMLTextAreaElement>();
	let mode = $state<'chat' | 'crypt'>(assistant.mode);
	let abort: AbortController | null = null;

	let pendingMail = $state<{ to: string; subject: string; text: string } | null>(null);
	let mailStatus = $state('');
	let mailSending = $state(false);

	let copiedIdx = $state(-1);
	let speakingIdx = $state(-1);
	let micSupported = $state(false);
	let listening = $state(false);
	let recog: any = null;
	let audioLevels = $state<number[]>([0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1]);
	let micStream: MediaStream | null = null;
	let audioCtx: AudioContext | null = null;
	let rafId = 0;

	let personas = $state<any[]>([]);
	let activePersonaId = $state(assistant.activePersonaId);
	let activePersona = $derived(personas.find((p) => p.id === activePersonaId));
	let personaMenu = $state(false);
	function setPersona(id: string) {
		activePersonaId = id;
		personaMenu = false;
		try { localStorage.setItem('astoris-persona', id); } catch { /* ignore */ }
	}

	// Modell-Wähler
	let modelOpts = $state<{ id: string; label: string; source: string; model: string }[]>([]);
	let selModelId = $state('');
	let modelMenu = $state(false);
	async function loadModels() {
		try {
			const r = await (await fetch('/api/models')).json();
			modelOpts = r.models ?? [];
			selModelId = r.selected ? (modelOpts.find((m) => m.source === r.selected.source && m.model === r.selected.model)?.id ?? '') : '';
		} catch { /* ignore */ }
	}
	async function setModel(opt: { id: string; source: string; model: string } | null) {
		modelMenu = false;
		selModelId = opt?.id ?? '';
		const body = opt ? { source: opt.source, model: opt.model } : { clear: true };
		try { await fetch('/api/models', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); } catch { /* ignore */ }
	}

	let chats = $state<{ id: string; title: string; updatedAt: string; count: number }[]>([]);
	let currentChatId = $state<string | null>(assistant.currentChatId);
	// Zustand in den Store spiegeln, damit er Navigation überlebt.
	$effect(() => { assistant.mode = mode; });
	$effect(() => { assistant.draft = draft; });
	$effect(() => { assistant.messages = messages; });
	$effect(() => { assistant.currentChatId = currentChatId; });
	$effect(() => { assistant.activePersonaId = activePersonaId; });
	async function loadChats() {
		try { const d = await (await fetch('/api/chats')).json(); chats = d.chats ?? []; } catch { /* ignore */ }
	}
	async function persistChat() {
		const stored = messages.filter((m) => !m.streaming && m.text).map((m) => ({ role: m.role, text: m.text, reasoning: m.reasoning, tools: m.tools, model: m.model, ms: m.ms, time: m.time, demo: m.demo }));
		if (!stored.length) return;
		try {
			const d = await (await fetch('/api/chats', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: currentChatId, messages: stored }) })).json();
			currentChatId = d.chat.id;
			await loadChats();
		} catch { /* ignore */ }
	}
	async function openChat(id: string) {
		if (busy) return;
		try { const d = await (await fetch('/api/chats?id=' + id)).json(); messages = (d.chat.messages ?? []).map((m: any) => ({ ...m })); currentChatId = id; scrollDown(); } catch { /* ignore */ }
	}
	async function renameChatItem(id: string, title: string) {
		await fetch('/api/chats?id=' + id, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title }) });
		await loadChats();
	}
	async function removeChatItem(id: string) {
		await fetch('/api/chats?id=' + id, { method: 'DELETE' });
		if (id === currentChatId) clearChat();
		await loadChats();
	}

	const prompts = [
		'Erklär mir kurz, was du alles kannst',
		'Schreib eine freundliche Absage-Mail',
		'Fasse den Unterschied zwischen TCP und UDP zusammen',
		'Gib mir 3 Ideen für ein Team-Event'
	];

	function nowTime() {
		return new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
	}
	function fmtDur(ms?: number) {
		return ms ? `${(ms / 1000).toFixed(1)}s` : '';
	}

	function resize() {
		if (!ta) return;
		ta.style.height = 'auto';
		ta.style.height = Math.min(ta.scrollHeight, 180) + 'px';
	}

	async function scrollDown() {
		await tick();
		scroller?.scrollTo({ top: scroller.scrollHeight, behavior: 'smooth' });
	}

	async function send(text: string) {
		const msg = text.trim();
		if (!msg || busy) return;
		messages.push({ role: 'user', text: msg });
		draft = '';
		resize();
		const aIdx = messages.push({ role: 'assistant', text: '', reasoning: '', streaming: true }) - 1;
		busy = true;
		scrollDown();
		abort = new AbortController();
		try {
			const history = messages.slice(0, -1).map((m) => ({ role: m.role, content: m.text }));
			const sys = activePersona?.systemPrompt;
			const payload = sys ? [{ role: 'system', content: sys }, ...history] : history;
			const res = await fetch('/api/chat/stream', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ messages: payload }),
				signal: abort.signal
			});
			if (!res.body) throw new Error('kein Stream');
			const reader = res.body.getReader();
			const dec = new TextDecoder();
			let buf = '';
			for (;;) {
				const { done, value } = await reader.read();
				if (done) break;
				buf += dec.decode(value, { stream: true });
				const events = buf.split('\n\n');
				buf = events.pop() ?? '';
				for (const ev of events) {
					const line = ev.trim();
					if (!line.startsWith('data:')) continue;
					let d: any;
					try { d = JSON.parse(line.slice(5).trim()); } catch { continue; }
					const m = messages[aIdx];
					if (d.type === 'reasoning') m.reasoning = (m.reasoning ?? '') + d.text;
					else if (d.type === 'content') m.text += d.text;
					else if (d.type === 'tools') m.tools = d.names;
					else if (d.type === 'pending-mail') { if (d.mode === 'direct') { sendPendingMail(d.draft); } else { pendingMail = d.draft; mailStatus = ''; } }
					else if (d.type === 'error') { m.text += (m.text ? '\n\n' : '') + (d.text ?? 'Fehler'); m.error = true; }
					else if (d.type === 'done') { m.model = d.model; m.ms = d.ms; m.demo = d.demo; m.time = nowTime(); }
					scrollDown();
				}
			}
		} catch (e: any) {
			if (e?.name !== 'AbortError') {
				messages[aIdx].text += (messages[aIdx].text ? ' ' : '') + '(Verbindungsfehler)';
				messages[aIdx].error = true;
			}
		} finally {
			if (!messages[aIdx].time) messages[aIdx].time = nowTime();
			messages[aIdx].streaming = false;
			busy = false;
			abort = null;
			scrollDown();
			persistChat();
		}
	}

	function stop() {
		abort?.abort();
		busy = false;
	}

	async function sendPendingMail(draft: { to: string; subject: string; text: string }) {
		mailSending = true;
		mailStatus = '';
		try {
			const res = await fetch('/api/mail/send', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ to: draft.to, subject: draft.subject, text: draft.text })
			});
			const d = await res.json().catch(() => ({}));
			if (res.ok && d.ok) {
				mailStatus = i18n.t('mailcard.sent');
				pendingMail = null;
				// Bestätigung an die letzte Assistant-Nachricht anhängen
				for (let i = messages.length - 1; i >= 0; i--) {
					if (messages[i].role === 'assistant') {
						const note = `${i18n.t('mailcard.sent')} — ${draft.to}`;
						messages[i].text += (messages[i].text ? '\n\n' : '') + note;
						break;
					}
				}
				persistChat();
			} else {
				mailStatus = i18n.t('mailcard.failed');
			}
		} catch {
			mailStatus = i18n.t('mailcard.failed');
		} finally {
			mailSending = false;
		}
	}

	function cancelPendingMail() {
		pendingMail = null;
		mailStatus = '';
	}

	function clearChat() {
		if (busy) stop();
		messages = [];
		currentChatId = null;
		stopSpeak();
	}

	function onKey(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			send(draft);
		}
	}

	async function copy(i: number, text: string) {
		try {
			if (navigator.clipboard && window.isSecureContext) {
				await navigator.clipboard.writeText(text);
			} else {
				const tmp = document.createElement('textarea');
				tmp.value = text;
				tmp.style.position = 'fixed';
				tmp.style.opacity = '0';
				document.body.appendChild(tmp);
				tmp.select();
				document.execCommand('copy');
				tmp.remove();
			}
			copiedIdx = i;
			setTimeout(() => (copiedIdx = i === copiedIdx ? -1 : copiedIdx), 1500);
		} catch { /* ignore */ }
	}

	function toTresor(text: string) {
		handoff.tresorText = text;
		goto('/tresor');
	}
	function download(text: string) {
		const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
		const a = document.createElement('a');
		a.href = URL.createObjectURL(blob);
		a.download = `astoris_antwort_${nowTime().replace(':', '')}.txt`;
		a.click();
		URL.revokeObjectURL(a.href);
	}

	function stopSpeak() {
		if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
		speakingIdx = -1;
	}
	function speak(i: number, text: string) {
		if (!('speechSynthesis' in window)) return;
		window.speechSynthesis.cancel();
		if (speakingIdx === i) { speakingIdx = -1; return; }
		const u = new SpeechSynthesisUtterance(text);
		u.lang = 'de-DE';
		u.onend = () => (speakingIdx = -1);
		speakingIdx = i;
		window.speechSynthesis.speak(u);
	}

	async function startVisualizer() {
		try {
			micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
			audioCtx = new AudioContext();
			const src = audioCtx.createMediaStreamSource(micStream);
			const analyser = audioCtx.createAnalyser();
			analyser.fftSize = 64;
			src.connect(analyser);
			const data = new Uint8Array(analyser.frequencyBinCount);
			const n = audioLevels.length;
			const step = Math.max(1, Math.floor(data.length / n));
			const loop = () => {
				analyser.getByteFrequencyData(data);
				audioLevels = Array.from({ length: n }, (_, i) => {
					let sum = 0;
					for (let j = 0; j < step; j++) sum += data[i * step + j] ?? 0;
					return Math.min(1, sum / step / 170);
				});
				rafId = requestAnimationFrame(loop);
			};
			loop();
		} catch { /* Mikrofon verweigert → ohne Pegel-Visualisierung */ }
	}
	function stopVisualizer() {
		if (rafId) cancelAnimationFrame(rafId);
		rafId = 0;
		micStream?.getTracks().forEach((t) => t.stop());
		audioCtx?.close().catch(() => {});
		micStream = null; audioCtx = null;
		audioLevels = audioLevels.map(() => 0.1);
	}
	function toggleMic() {
		if (!micSupported || !recog) return;
		if (listening) { recog.stop(); listening = false; stopVisualizer(); return; }
		try { recog.start(); listening = true; startVisualizer(); } catch { /* schon aktiv */ }
	}

	function onSpaceDown(e: KeyboardEvent) {
		if (!voice.enabled || voice.mode !== 'ptt' || !micSupported || !recog) return;
		if (e.code !== 'Space' || e.repeat || listening) return;
		if (draft.trim()) return; // Text im Feld → Leerzeichen normal erlauben
		e.preventDefault();
		try { recog.start(); listening = true; startVisualizer(); } catch { /* schon aktiv */ }
	}
	function onSpaceUp(e: KeyboardEvent) {
		if (voice.mode !== 'ptt' || e.code !== 'Space' || !listening || !recog) return;
		recog.stop(); listening = false; stopVisualizer();
	}
	onMount(() => {
		loadChats();
		fetch('/api/personas').then((r) => r.json()).then((d) => { personas = d.personas ?? []; }).catch(() => {});
		loadModels();
		try { const sp = localStorage.getItem('astoris-persona'); if (sp) activePersonaId = sp; } catch { /* ignore */ }
		const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
		if (SR && window.isSecureContext) {
			micSupported = true;
			recog = new SR();
			recog.lang = 'de-DE';
			recog.interimResults = false;
			recog.onresult = (e: any) => {
				draft += (draft ? ' ' : '') + e.results[0][0].transcript;
				resize();
			};
			recog.onend = () => { listening = false; stopVisualizer(); };
			recog.onerror = () => { listening = false; stopVisualizer(); };
		}
		window.addEventListener('keydown', onSpaceDown);
		window.addEventListener('keyup', onSpaceUp);
		return () => {
			window.removeEventListener('keydown', onSpaceDown);
			window.removeEventListener('keyup', onSpaceUp);
		};
	});
</script>

<div class="alayout">
	{#if mode === 'chat'}
		<ChatSidebar chats={chats} currentId={currentChatId} onOpen={openChat} onNew={clearChat} onRename={renameChatItem} onDelete={removeChatItem} />
	{/if}
	<div class="amain">
<AppHeader title="Assistent" eyebrow="Maschinenraum">
	<div class="modetoggle">
		<button class:sel={mode === 'chat'} onclick={() => (mode = 'chat')}>{i18n.t('chat.assistant')}</button>
		<button class:sel={mode === 'crypt'} onclick={() => (mode = 'crypt')}>{i18n.t('crypt.title')}</button>
	</div>
	{#if mode === 'chat'}
	<div class="ppick-wrap">
		<button class="ppick" onclick={() => (personaMenu = !personaMenu)} title="Persönlichkeit wählen">
			<span class="pe">{activePersona?.emoji ?? '🛰️'}</span>
			<span>{activePersona?.name ?? 'Astoris'}</span>
			<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>
		</button>
		{#if personaMenu}
			<div class="pmenu">
				{#each personas as p (p.id)}
					<button class="pitem" class:sel={p.id === activePersonaId} onclick={() => setPersona(p.id)}>
						<span class="pe">{p.emoji}</span>
						<span class="pinfo"><strong>{p.name}</strong><small>{p.tagline}</small></span>
					</button>
				{/each}
			</div>
		{/if}
	</div>
	{#if modelOpts.length > 1}
	<div class="ppick-wrap">
		<button class="ppick" onclick={() => (modelMenu = !modelMenu)} title="Modell wählen">
			<span class="pe">🧠</span>
			<span>{modelOpts.find((m) => m.id === selModelId)?.label ?? i18n.t('settings.kiSourceAuto')}</span>
			<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>
		</button>
		{#if modelMenu}
			<div class="pmenu">
				<button class="pitem" class:sel={selModelId === ''} onclick={() => setModel(null)}>
					<span class="pinfo"><strong>{i18n.t('settings.kiSourceAuto')}</strong><small>{i18n.t('settings.kiSource')}</small></span>
				</button>
				{#each modelOpts as m (m.id)}
					<button class="pitem" class:sel={m.id === selModelId} onclick={() => setModel(m)}>
						<span class="pinfo"><strong>{m.label}</strong><small>{m.source === 'cloud' ? 'Cloud' : 'Lokal'}</small></span>
					</button>
				{/each}
			</div>
		{/if}
	</div>
	{/if}
	{#if messages.length}
		<button class="hbtn" onclick={clearChat} title="Neuer Chat">
			<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>
			{i18n.t('chat.newChat')}
		</button>
	{/if}
	{/if}
</AppHeader>

{#if mode === 'crypt'}
	<CryptChat />
{/if}
<div class="chat" class:hidden={mode === 'crypt'}>
	<div class="stream" bind:this={scroller}>
		{#if messages.length === 0}
			<div class="welcome">
				<h2>{i18n.t('chat.welcome')}</h2>
				<p>{i18n.t('chat.welcomeSub')}</p>
				<div class="suggest">
					{#each prompts as p (p)}
						<button class="chip" onclick={() => send(p)}>{p}</button>
					{/each}
				</div>
			</div>
		{:else}
			{#each messages as m, i (i)}
				<div class="row {m.role}">
					<div class="bubble" class:err={m.error}>
						{#if m.role === 'assistant' && m.reasoning}
							<details class="think">
								<summary>Denkt nach</summary>
								<div class="think-body">{m.reasoning}</div>
							</details>
						{/if}

						{#if m.role === 'assistant' && m.tools?.length}
							<div class="tool-used">
								<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.8 2.8-2.2-2.2 2.8-2.8z"/></svg>
								<span>{m.tools.map((t) => t.replace(/_/g, ' ')).join(', ')}</span>
							</div>
						{/if}

						{#if m.role === 'assistant'}
							{#if m.text}
								<div class="md">{@html renderMarkdown(m.text)}</div>
							{:else if m.streaming}
								<div class="typing"><span></span><span></span><span></span></div>
							{/if}
						{:else}
							{m.text}
						{/if}

						{#if m.role === 'assistant' && !m.streaming && m.text}
							<div class="meta">
								<span class="info">
									<span class="mi"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="9"/><path d="M12 7.5v5l3 2"/></svg>{m.time}</span>
									{#if m.ms}<span class="mi"><svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M13 2 4 14h7l-1 8 9-12h-7z"/></svg>{fmtDur(m.ms)}</span>{/if}
									{#if m.model}<span class="mi"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="7" y="7" width="10" height="10" rx="2"/><path d="M9 3v2M15 3v2M9 19v2M15 19v2M3 9h2M3 15h2M19 9h2M19 15h2"/></svg>{m.model}</span>{/if}
									{#if m.demo}<span class="mi demo">Demo</span>{/if}
								</span>
								<span class="acts">
									<button title="Kopieren" onclick={() => copy(i, m.text)}>
										{#if copiedIdx === i}✓{:else}
											<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>
										{/if}
									</button>
									<button title="Vorlesen" class:on={speakingIdx === i} onclick={() => speak(i, m.text)}>
										<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H3v6h3l5 4zM16 9a4 4 0 0 1 0 6M19 6a8 8 0 0 1 0 12"/></svg>
									</button>
									<button title="Als .txt speichern" onclick={() => download(m.text)}>
										<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11M8 11l4 4 4-4M5 19h14"/></svg>
									</button>
									<button title={i18n.t('chat.toVault')} onclick={() => toTresor(m.text)}>
										<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>
									</button>
								</span>
							</div>
						{/if}
					</div>
				</div>
			{/each}
		{/if}
	</div>

	{#if pendingMail}
		<div class="mailcard">
			<div class="mc-head">
				<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>
				<strong>{i18n.t('mailcard.title')}</strong>
			</div>
			<label class="mc-field">
				<span>{i18n.t('mailcard.to')}</span>
				<input type="text" bind:value={pendingMail.to} />
			</label>
			<label class="mc-field">
				<span>{i18n.t('mailcard.subject')}</span>
				<input type="text" bind:value={pendingMail.subject} />
			</label>
			<label class="mc-field">
				<span>{i18n.t('mailcard.text')}</span>
				<textarea class="mc-text" rows="5" bind:value={pendingMail.text}></textarea>
			</label>
			{#if mailStatus}<div class="mc-status">{mailStatus}</div>{/if}
			<div class="mc-actions">
				<button class="mc-cancel" onclick={cancelPendingMail} disabled={mailSending}>{i18n.t('mailcard.cancel')}</button>
				<button class="mc-send" onclick={() => pendingMail && sendPendingMail(pendingMail)} disabled={mailSending}>{i18n.t('mailcard.send')}</button>
			</div>
		</div>
	{:else if mailStatus}
		<div class="mailcard mc-flash">{mailStatus}</div>
	{/if}

	<div class="composer">
		{#if voice.enabled}
			<button
				class="mic"
				class:listening
				onclick={toggleMic}
				disabled={!micSupported}
				title={!micSupported ? 'Mikrofon braucht HTTPS (siehe Hinweis)' : (voice.mode === 'ptt' ? i18n.t('settings.voicePtt') : i18n.t('settings.voice'))}
				aria-label={i18n.t('settings.voice')}
			>
				<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M6 11a6 6 0 0 0 12 0M12 17v4"/></svg>
			</button>
		{/if}
		{#if listening}
			<div class="wave" aria-live="polite">
				{#each audioLevels as lvl, i (i)}
					<span style="transform: scaleY({0.12 + lvl * 0.88})"></span>
				{/each}
				<em>{i18n.t('chat.listening')}</em>
			</div>
		{:else}
			<textarea
				bind:this={ta}
				bind:value={draft}
				oninput={resize}
				onkeydown={onKey}
				rows="1"
				placeholder={i18n.t('chat.placeholder')}
			></textarea>
		{/if}
		{#if busy}
			<button class="send stop" onclick={stop} aria-label="Stop" title="Stoppen">
				<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
			</button>
		{:else}
			<button class="send" disabled={!draft.trim()} onclick={() => send(draft)} aria-label="Senden">
				<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h13M12 5l7 7-7 7"/></svg>
			</button>
		{/if}
	</div>
</div>
	</div>
</div>

<style>
	.alayout { display: flex; flex: 1; min-height: 0; }
	.amain { flex: 1; display: flex; flex-direction: column; min-width: 0; min-height: 0; }
	.hidden { display: none !important; }
	.modetoggle { display: inline-flex; gap: 2px; background: var(--surface-2); border: 1px solid var(--border-soft); border-radius: 999px; padding: 3px; margin-right: auto; }
	.modetoggle button { font-size: 12.5px; font-weight: 500; color: var(--text-muted); background: transparent; border: none; border-radius: 999px; padding: 5px 15px; transition: all 0.15s; }
	.modetoggle button:hover { color: var(--text); }
	.modetoggle button.sel { color: var(--ember-bright); background: var(--ember-soft); }
	.hbtn { display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; color: var(--text-muted); background: var(--surface-1); border: 1px solid var(--border-soft); border-radius: 999px; padding: 6px 12px; transition: all 0.16s; }
	.hbtn:hover { color: var(--text); border-color: var(--ember-line); }

	.chat { flex: 1; display: flex; flex-direction: column; min-height: 0; }
	.stream { flex: 1; overflow-y: auto; padding: 26px 28px; display: flex; flex-direction: column; gap: 16px; }
	.welcome { margin: auto; max-width: 540px; text-align: center; }
	.welcome h2 { font-size: 26px; }
	.welcome p { color: var(--text-muted); margin: 10px 0 22px; }
	.suggest { display: flex; flex-wrap: wrap; gap: 9px; justify-content: center; }
	.chip { background: var(--surface-1); border: 1px solid var(--border-soft); color: var(--text-muted); padding: 9px 14px; border-radius: 999px; font-size: 13px; transition: all 0.16s var(--ease); }
	.chip:hover { color: var(--text); border-color: var(--ember-line); background: var(--surface-2); transform: translateY(-1px); }

	.row { display: flex; max-width: 780px; width: 100%; margin: 0 auto; }
	.row.user { justify-content: flex-end; }
	.bubble { position: relative; padding: 12px 15px; border-radius: 14px; font-size: 14.5px; line-height: 1.6; max-width: 82%; word-break: break-word; }
	.user .bubble { background: var(--ember); color: #1a1206; border-bottom-right-radius: 5px; font-weight: 500; white-space: pre-wrap; }
	.assistant .bubble { background: var(--surface-1); border: 1px solid var(--border-soft); border-bottom-left-radius: 5px; max-width: 100%; }
	.bubble.err { border-color: var(--danger-soft); }

	.think { margin-bottom: 8px; }
	.think summary { cursor: pointer; font-size: 12px; color: var(--text-faint); font-family: var(--font-mono); letter-spacing: 0.04em; list-style: none; user-select: none; }
	.think summary::before { content: '▸ '; }
	.think[open] summary::before { content: '▾ '; }
	.think-body { margin-top: 8px; padding: 10px 12px; border-left: 2px solid var(--border); background: var(--bg-veil); border-radius: 0 8px 8px 0; font-size: 12.5px; color: var(--text-muted); white-space: pre-wrap; max-height: 220px; overflow-y: auto; }

	.md :global(p) { margin: 0 0 10px; }
	.md :global(p:last-child) { margin-bottom: 0; }
	.md :global(pre) { background: var(--bg-veil); border: 1px solid var(--border-soft); border-radius: 8px; padding: 12px; overflow-x: auto; font-family: var(--font-mono); font-size: 12.5px; }
	.md :global(code) { font-family: var(--font-mono); font-size: 0.88em; background: var(--surface-3); padding: 1px 5px; border-radius: 4px; }
	.md :global(pre code) { background: none; padding: 0; }
	.md :global(a) { color: var(--ember-bright); text-decoration: underline; }
	.md :global(ul), .md :global(ol) { margin: 0 0 10px; padding-left: 20px; }
	.md :global(h1), .md :global(h2), .md :global(h3) { font-size: 1.05em; margin: 12px 0 6px; }
	.md :global(blockquote) { border-left: 2px solid var(--ember-line); margin: 0 0 10px; padding-left: 12px; color: var(--text-muted); }
	.md :global(table) { border-collapse: collapse; font-size: 13px; margin-bottom: 10px; }
	.md :global(th), .md :global(td) { border: 1px solid var(--border); padding: 5px 9px; }

	.typing { display: flex; gap: 4px; padding: 3px 0; }
	.typing span { width: 6px; height: 6px; border-radius: 50%; background: var(--text-faint); animation: blink 1.3s infinite; }
	.typing span:nth-child(2) { animation-delay: 0.2s; }
	.typing span:nth-child(3) { animation-delay: 0.4s; }
	@keyframes blink { 0%, 60%, 100% { opacity: 0.25; } 30% { opacity: 1; } }

	.meta { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 10px; padding-top: 8px; border-top: 1px solid var(--border-soft); }
	.info { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
	.mi { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; color: var(--text-faint); }
	.mi svg { width: 12px; height: 12px; opacity: 0.8; }
	.mi.demo { color: var(--ember-bright); }
	.tool-used { display: inline-flex; align-items: center; gap: 6px; margin: 2px 0 10px; padding: 4px 10px; font-size: 11.5px; font-weight: 500; color: var(--sage); background: var(--sage-soft); border: 1px solid color-mix(in srgb, var(--sage) 25%, transparent); border-radius: 999px; text-transform: capitalize; }
	.tool-used svg { flex: none; }
	.acts { display: flex; gap: 2px; }
	.acts button { width: 28px; height: 28px; display: grid; place-items: center; border-radius: 7px; color: var(--text-faint); background: transparent; border: none; transition: all 0.14s; }
	.acts button:hover { color: var(--text); background: var(--surface-3); }
	.acts button.on { color: var(--ember-bright); }

	.composer { flex: none; display: flex; align-items: flex-end; gap: 9px; padding: 14px 28px 22px; max-width: 838px; width: 100%; margin: 0 auto; }
	.mic { width: 44px; height: 44px; flex: none; display: grid; place-items: center; border-radius: 13px; background: var(--surface-1); border: 1px solid var(--border); color: var(--text-muted); transition: all 0.16s; }
	.mic:not(:disabled):hover { color: var(--text); border-color: var(--ember-line); }
	.mic:disabled { opacity: 0.4; cursor: not-allowed; }
	.mic.listening { color: var(--ember-bright); border-color: var(--ember); background: var(--ember-soft); animation: pulse 1.4s infinite; }
	.wave { flex: 1; display: flex; align-items: center; gap: 3px; height: 44px; padding: 0 16px; }
	.wave span { width: 3px; height: 24px; border-radius: 3px; background: var(--ember); transform-origin: center; transition: transform 0.07s linear; }
	.wave em { margin-left: 12px; font-size: 12.5px; color: var(--text-muted); font-style: normal; }
	@keyframes pulse { 0%, 100% { box-shadow: 0 0 0 0 rgba(232,132,60,0.3); } 50% { box-shadow: 0 0 0 6px rgba(232,132,60,0); } }
	textarea { flex: 1; resize: none; background: var(--surface-1); border: 1px solid var(--border); border-radius: 14px; color: var(--text); padding: 13px 16px; font-family: var(--font-body); font-size: 14.5px; max-height: 180px; line-height: 1.5; transition: border-color 0.16s; }
	textarea:focus { outline: none; border-color: var(--ember-line); }
	.send { width: 46px; height: 46px; flex: none; display: grid; place-items: center; border-radius: 13px; border: none; background: var(--ember); color: #1a1206; transition: opacity 0.16s, transform 0.16s; }
	.send:disabled { opacity: 0.4; cursor: not-allowed; }
	.send:not(:disabled):hover { transform: translateY(-1px); }
	.send.stop { background: var(--surface-3); color: var(--text); }

	.mailcard { flex: none; max-width: 838px; width: 100%; margin: 0 auto; padding: 16px 18px; background: var(--surface-1); border: 1px solid var(--border); border-radius: 14px; display: flex; flex-direction: column; gap: 10px; }
	.mc-head { display: flex; align-items: center; gap: 8px; color: var(--text); }
	.mc-head strong { font-size: 14px; font-weight: 600; }
	.mc-head svg { color: var(--ember-bright); flex: none; }
	.mc-field { display: flex; flex-direction: column; gap: 4px; }
	.mc-field > span { font-size: 11.5px; color: var(--text-muted); }
	.mailcard input, .mailcard textarea { width: 100%; background: var(--bg); border: 1px solid var(--border); border-radius: 9px; color: var(--text); padding: 9px 12px; font-size: 13.5px; font-family: var(--font-body); transition: border-color 0.16s; }
	.mailcard textarea.mc-text { resize: vertical; line-height: 1.5; }
	.mailcard input:focus, .mailcard textarea:focus { outline: none; border-color: var(--ember-line); }
	.mc-status { font-size: 12.5px; color: var(--text-muted); }
	.mc-actions { display: flex; justify-content: flex-end; gap: 9px; margin-top: 2px; }
	.mc-cancel, .mc-send { border-radius: 9px; padding: 9px 18px; font-size: 13px; font-weight: 500; border: 1px solid transparent; transition: all 0.16s; }
	.mc-cancel { background: transparent; border: 1px solid var(--border); color: var(--text-muted); }
	.mc-cancel:not(:disabled):hover { color: var(--text); border-color: var(--text-faint); }
	.mc-send { background: var(--ember); color: #1a1206; }
	.mc-send:not(:disabled):hover { transform: translateY(-1px); }
	.mc-cancel:disabled, .mc-send:disabled { opacity: 0.5; cursor: not-allowed; }
	.mc-flash { font-size: 12.5px; color: var(--text-muted); padding: 12px 18px; }

	.ppick-wrap { position: relative; }
	.ppick { display: inline-flex; align-items: center; gap: 7px; font-size: 12.5px; color: var(--text-muted); background: var(--surface-1); border: 1px solid var(--border-soft); border-radius: 999px; padding: 6px 12px; transition: all 0.16s; }
	.ppick:hover { color: var(--text); border-color: var(--ember-line); }
	.ppick .pe { font-size: 14px; }
	.pmenu { position: absolute; top: calc(100% + 6px); right: 0; width: 240px; background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius); box-shadow: var(--shadow); padding: 5px; z-index: 50; max-height: 320px; overflow-y: auto; }
	.pitem { display: flex; align-items: center; gap: 10px; width: 100%; text-align: left; padding: 8px 10px; border-radius: 8px; background: transparent; border: none; color: var(--text); transition: background 0.14s; }
	.pitem:hover { background: var(--surface-3); }
	.pitem.sel { background: var(--ember-soft); }
	.pitem .pe { font-size: 18px; flex: none; }
	.pinfo { display: flex; flex-direction: column; min-width: 0; }
	.pinfo strong { font-size: 13px; font-weight: 500; }
	.pinfo small { font-size: 11px; color: var(--text-faint); }
</style>
