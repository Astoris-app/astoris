<script lang="ts">
	import { onMount } from 'svelte';
	import AppHeader from '$lib/components/AppHeader.svelte';

	// Google-Kalender-Sync folgt in Verfeinerung (über Verbindungen).

	type CalendarEvent = {
		id: string;
		title: string;
		date: string; // YYYY-MM-DD
		time?: string;
		notes?: string;
	};

	const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
	const MONTHS = [
		'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
		'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'
	];

	let events = $state<CalendarEvent[]>([]);
	let loading = $state(true);
	let errMsg = $state('');

	const today = new Date();
	const todayKey = ymd(today);

	// Currently viewed month.
	let viewYear = $state(today.getFullYear());
	let viewMonth = $state(today.getMonth()); // 0-based

	let selectedDate = $state<string>(todayKey);

	// New-event form fields.
	let fTitle = $state('');
	let fTime = $state('');
	let fNotes = $state('');
	let saving = $state(false);
	let formErr = $state('');

	function pad(n: number): string {
		return n < 10 ? '0' + n : String(n);
	}
	function ymd(d: Date): string {
		return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
	}

	// Events grouped by date key for quick lookup.
	let byDate = $derived.by(() => {
		const map = new Map<string, CalendarEvent[]>();
		for (const e of events) {
			const arr = map.get(e.date) ?? [];
			arr.push(e);
			map.set(e.date, arr);
		}
		for (const arr of map.values()) {
			arr.sort((a, b) => (a.time ?? '99:99').localeCompare(b.time ?? '99:99'));
		}
		return map;
	});

	// Grid cells (Mon–Sun) for the viewed month, padded with leading/trailing nulls.
	let cells = $derived.by(() => {
		const first = new Date(viewYear, viewMonth, 1);
		// JS getDay: 0=Sun..6=Sat → shift so Monday is index 0.
		const lead = (first.getDay() + 6) % 7;
		const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
		const out: (string | null)[] = [];
		for (let i = 0; i < lead; i++) out.push(null);
		for (let d = 1; d <= daysInMonth; d++) {
			out.push(`${viewYear}-${pad(viewMonth + 1)}-${pad(d)}`);
		}
		while (out.length % 7 !== 0) out.push(null);
		return out;
	});

	let selectedEvents = $derived(byDate.get(selectedDate) ?? []);

	// Next upcoming events from today onward.
	let upcoming = $derived.by(() => {
		return [...events]
			.filter((e) => e.date >= todayKey)
			.sort((a, b) => {
				const c = a.date.localeCompare(b.date);
				return c !== 0 ? c : (a.time ?? '99:99').localeCompare(b.time ?? '99:99');
			})
			.slice(0, 8);
	});

	function dayNum(key: string): number {
		return parseInt(key.slice(8), 10);
	}

	function prettyDate(key: string): string {
		const [y, m, d] = key.split('-').map((n) => parseInt(n, 10));
		return `${d}. ${MONTHS[m - 1]} ${y}`;
	}

	function prevMonth() {
		if (viewMonth === 0) {
			viewMonth = 11;
			viewYear--;
		} else viewMonth--;
	}
	function nextMonth() {
		if (viewMonth === 11) {
			viewMonth = 0;
			viewYear++;
		} else viewMonth++;
	}
	function goToday() {
		viewYear = today.getFullYear();
		viewMonth = today.getMonth();
		selectedDate = todayKey;
	}

	function selectDay(key: string) {
		selectedDate = key;
		formErr = '';
	}

	async function load() {
		loading = true;
		errMsg = '';
		try {
			const res = await fetch('/api/calendar');
			if (!res.ok) throw new Error('Laden fehlgeschlagen');
			const data = await res.json();
			events = Array.isArray(data?.events) ? data.events : [];
		} catch (e) {
			errMsg = e instanceof Error ? e.message : 'Unbekannter Fehler';
		} finally {
			loading = false;
		}
	}

	async function addEvent(ev: SubmitEvent) {
		ev.preventDefault();
		formErr = '';
		const title = fTitle.trim();
		if (!title) {
			formErr = 'Titel ist erforderlich.';
			return;
		}
		saving = true;
		try {
			const res = await fetch('/api/calendar', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					title,
					date: selectedDate,
					time: fTime.trim() || undefined,
					notes: fNotes.trim() || undefined
				})
			});
			if (!res.ok) {
				const d = await res.json().catch(() => null);
				throw new Error(d?.message || 'Speichern fehlgeschlagen');
			}
			const d = await res.json();
			if (d?.event) events = [...events, d.event];
			fTitle = '';
			fTime = '';
			fNotes = '';
		} catch (e) {
			formErr = e instanceof Error ? e.message : 'Unbekannter Fehler';
		} finally {
			saving = false;
		}
	}

	async function deleteEvent(id: string) {
		try {
			const res = await fetch(`/api/calendar?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
			if (!res.ok) throw new Error();
			events = events.filter((e) => e.id !== id);
		} catch {
			errMsg = 'Löschen fehlgeschlagen';
		}
	}

	onMount(load);
</script>

<AppHeader title="Kalender" eyebrow="Termine & Notizen">
	<button class="btn-today" onclick={goToday}>Heute</button>
</AppHeader>

<div class="scroll">
	{#if errMsg}
		<div class="banner">{errMsg}</div>
	{/if}

	<div class="layout">
		<!-- Month grid -->
		<section class="cal">
			<div class="navbar">
				<button class="nav" aria-label="Vorheriger Monat" onclick={prevMonth}>
					<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
				</button>
				<h2>{MONTHS[viewMonth]} {viewYear}</h2>
				<button class="nav" aria-label="Nächster Monat" onclick={nextMonth}>
					<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6" /></svg>
				</button>
			</div>

			<div class="weekdays">
				{#each WEEKDAYS as w (w)}
					<span>{w}</span>
				{/each}
			</div>

			<div class="grid">
				{#each cells as key, i (i)}
					{#if key === null}
						<div class="cell empty"></div>
					{:else}
						<button
							class="cell"
							class:today={key === todayKey}
							class:selected={key === selectedDate}
							onclick={() => selectDay(key)}
						>
							<span class="num">{dayNum(key)}</span>
							{#if byDate.has(key)}
								<span class="marker" class:multi={(byDate.get(key)?.length ?? 0) > 1}></span>
							{/if}
						</button>
					{/if}
				{/each}
			</div>
		</section>

		<!-- Side: selected day + upcoming -->
		<aside class="side">
			<section class="panel">
				<h3 class="day-title">{prettyDate(selectedDate)}</h3>

				{#if loading}
					<p class="muted">Lädt …</p>
				{:else if selectedEvents.length === 0}
					<p class="muted">Keine Termine an diesem Tag.</p>
				{:else}
					<ul class="evlist">
						{#each selectedEvents as e (e.id)}
							<li class="ev">
								<div class="ev-main">
									<div class="ev-head">
										{#if e.time}<span class="ev-time mono">{e.time}</span>{/if}
										<span class="ev-title">{e.title}</span>
									</div>
									{#if e.notes}<p class="ev-notes">{e.notes}</p>{/if}
								</div>
								<button class="del" aria-label="Termin löschen" onclick={() => deleteEvent(e.id)}>
									<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /></svg>
								</button>
							</li>
						{/each}
					</ul>
				{/if}

				<form class="form" onsubmit={addEvent}>
					<input class="in" type="text" placeholder="Titel" bind:value={fTitle} maxlength="120" />
					<div class="row">
						<input class="in" type="time" bind:value={fTime} aria-label="Uhrzeit" />
						<button class="btn-add" type="submit" disabled={saving}>
							{saving ? 'Speichert …' : 'Hinzufügen'}
						</button>
					</div>
					<textarea class="in ta" placeholder="Notiz (optional)" bind:value={fNotes} rows="2"></textarea>
					{#if formErr}<span class="form-err">{formErr}</span>{/if}
				</form>
			</section>

			<section class="panel">
				<h3 class="day-title">Anstehend</h3>
				{#if upcoming.length === 0}
					<p class="muted">Keine anstehenden Termine.</p>
				{:else}
					<ul class="up">
						{#each upcoming as e (e.id)}
							<li>
								<button class="up-item" onclick={() => selectDay(e.date)}>
									<span class="up-date mono">{dayNum(e.date)}. {MONTHS[parseInt(e.date.slice(5, 7), 10) - 1].slice(0, 3)}</span>
									<span class="up-title">{e.title}</span>
									{#if e.time}<span class="up-time mono">{e.time}</span>{/if}
								</button>
							</li>
						{/each}
					</ul>
				{/if}
			</section>
		</aside>
	</div>
</div>

<style>
	.scroll {
		flex: 1;
		overflow-y: auto;
		padding: 24px 28px;
	}

	.banner {
		margin-bottom: 16px;
		padding: 10px 14px;
		border-radius: var(--radius-sm);
		border: 1px solid var(--danger);
		background: var(--surface-2);
		color: var(--danger);
		font-size: 13px;
	}

	.btn-today {
		padding: 6px 14px;
		border-radius: 999px;
		border: 1px solid var(--border-soft);
		background: var(--surface-1);
		color: var(--text-muted);
		font-size: 12px;
		cursor: pointer;
		font-family: var(--font-body);
	}
	.btn-today:hover {
		color: var(--text);
		border-color: var(--ember-line);
	}

	.layout {
		display: grid;
		grid-template-columns: minmax(0, 1.7fr) minmax(280px, 1fr);
		gap: 24px;
		align-items: start;
	}
	@media (max-width: 880px) {
		.layout {
			grid-template-columns: 1fr;
		}
	}

	/* Calendar */
	.cal {
		background: var(--surface-1);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		padding: 18px;
	}
	.navbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 16px;
	}
	.navbar h2 {
		font-size: 17px;
	}
	.nav {
		width: 32px;
		height: 32px;
		display: grid;
		place-items: center;
		border-radius: var(--radius-sm);
		border: 1px solid var(--border-soft);
		background: var(--surface-2);
		color: var(--text-muted);
		cursor: pointer;
	}
	.nav:hover {
		color: var(--ember-bright);
		border-color: var(--ember-line);
	}

	.weekdays {
		display: grid;
		grid-template-columns: repeat(7, 1fr);
		gap: 6px;
		margin-bottom: 6px;
	}
	.weekdays span {
		text-align: center;
		font-size: 11px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-faint);
	}

	.grid {
		display: grid;
		grid-template-columns: repeat(7, 1fr);
		gap: 6px;
	}
	.cell {
		position: relative;
		aspect-ratio: 1 / 1;
		min-height: 44px;
		display: flex;
		align-items: flex-start;
		justify-content: flex-end;
		padding: 6px 8px;
		border-radius: var(--radius-sm);
		border: 1px solid var(--border-soft);
		background: var(--surface-2);
		color: var(--text-muted);
		font-family: var(--font-body);
		cursor: pointer;
		transition: border-color 0.12s, background 0.12s;
	}
	.cell:hover {
		border-color: var(--ember-line);
		color: var(--text);
	}
	.cell.empty {
		background: transparent;
		border-color: transparent;
		cursor: default;
	}
	.cell .num {
		font-size: 13px;
	}
	.cell.today {
		border-color: var(--ember-line);
		background: var(--ember-soft);
		color: var(--ember-bright);
	}
	.cell.selected {
		outline: 2px solid var(--ember);
		outline-offset: -1px;
		color: var(--text);
	}
	.marker {
		position: absolute;
		left: 8px;
		bottom: 8px;
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--sage);
	}
	.marker.multi {
		width: 14px;
		border-radius: 3px;
		background: var(--ember);
	}

	/* Side */
	.side {
		display: flex;
		flex-direction: column;
		gap: 18px;
	}
	.panel {
		background: var(--surface-1);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		padding: 18px;
	}
	.day-title {
		font-size: 14px;
		margin-bottom: 12px;
		color: var(--text);
	}
	.muted {
		color: var(--text-faint);
		font-size: 13px;
		margin: 0 0 12px;
	}

	.evlist {
		list-style: none;
		padding: 0;
		margin: 0 0 14px;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.ev {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 8px;
		padding: 10px 12px;
		border-radius: var(--radius-sm);
		border: 1px solid var(--border-soft);
		background: var(--surface-2);
	}
	.ev-head {
		display: flex;
		align-items: baseline;
		gap: 8px;
		flex-wrap: wrap;
	}
	.ev-time {
		font-size: 12px;
		color: var(--ember-bright);
	}
	.ev-title {
		font-size: 13.5px;
		color: var(--text);
	}
	.ev-notes {
		margin: 4px 0 0;
		font-size: 12.5px;
		color: var(--text-muted);
		white-space: pre-wrap;
	}
	.del {
		flex: none;
		display: grid;
		place-items: center;
		width: 28px;
		height: 28px;
		border-radius: var(--radius-sm);
		border: 1px solid transparent;
		background: transparent;
		color: var(--text-faint);
		cursor: pointer;
	}
	.del:hover {
		color: var(--danger);
		border-color: var(--border-soft);
	}

	.form {
		display: flex;
		flex-direction: column;
		gap: 8px;
		border-top: 1px solid var(--border-soft);
		padding-top: 14px;
	}
	.in {
		width: 100%;
		padding: 9px 11px;
		border-radius: var(--radius-sm);
		border: 1px solid var(--border-soft);
		background: var(--surface-2);
		color: var(--text);
		font-size: 13px;
		font-family: var(--font-body);
	}
	.in:focus {
		outline: none;
		border-color: var(--ember-line);
	}
	.in::placeholder {
		color: var(--text-faint);
	}
	.ta {
		resize: vertical;
		min-height: 38px;
	}
	.row {
		display: flex;
		gap: 8px;
	}
	.row .in {
		flex: 1;
	}
	.btn-add {
		flex: none;
		padding: 9px 16px;
		border-radius: var(--radius-sm);
		border: 1px solid var(--ember-line);
		background: var(--ember-soft);
		color: var(--ember-bright);
		font-size: 13px;
		font-family: var(--font-body);
		cursor: pointer;
	}
	.btn-add:hover:not(:disabled) {
		background: var(--ember);
		color: var(--bg);
	}
	.btn-add:disabled {
		opacity: 0.6;
		cursor: default;
	}
	.form-err {
		color: var(--danger);
		font-size: 12px;
	}

	.up {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.up-item {
		width: 100%;
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 8px 10px;
		border-radius: var(--radius-sm);
		border: 1px solid transparent;
		background: var(--surface-2);
		color: var(--text);
		font-family: var(--font-body);
		text-align: left;
		cursor: pointer;
	}
	.up-item:hover {
		border-color: var(--ember-line);
	}
	.up-date {
		flex: none;
		font-size: 11.5px;
		color: var(--ember-bright);
		min-width: 52px;
	}
	.up-title {
		flex: 1;
		font-size: 13px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.up-time {
		flex: none;
		font-size: 11.5px;
		color: var(--text-faint);
	}
</style>
