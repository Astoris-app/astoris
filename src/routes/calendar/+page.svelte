<script lang="ts">
	import { onMount } from 'svelte';
	import AppHeader from '$lib/components/AppHeader.svelte';
	import { i18n } from '$lib/stores/i18n.svelte';
	import { dict } from '$lib/i18n/dict';

	// Google-Kalender-Sync folgt in Verfeinerung (über Verbindungen).

	type CalendarEvent = {
		id: string;
		title: string;
		date: string; // YYYY-MM-DD
		time?: string;
		notes?: string;
	};

	// Locale-aware weekday/month labels, reactive to the active language.
	const WEEKDAYS = $derived(dict[i18n.lang].calendar.weekdays);
	const MONTHS = $derived(dict[i18n.lang].calendar.months);

	let events = $state<CalendarEvent[]>([]);
	let loading = $state(true);
	let errMsg = $state('');

	const today = new Date();
	const todayKey = ymd(today);

	// Currently viewed month.
	let viewYear = $state(today.getFullYear());
	let viewMonth = $state(today.getMonth()); // 0-based

	let selectedDate = $state<string>(todayKey);

	// Active view: month grid, week strip, or agenda list.
	let view = $state<'month' | 'week' | 'agenda'>('month');

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

	// Parse a YYYY-MM-DD key into a local Date (noon to dodge DST edges).
	function keyToDate(key: string): Date {
		const [y, m, d] = key.split('-').map((n) => parseInt(n, 10));
		return new Date(y, m - 1, d, 12, 0, 0);
	}

	// Monday–Sunday keys for the week containing selectedDate.
	let weekDays = $derived.by(() => {
		const base = keyToDate(selectedDate);
		const lead = (base.getDay() + 6) % 7; // 0=Mon..6=Sun
		const monday = new Date(base);
		monday.setDate(base.getDate() - lead);
		const out: string[] = [];
		for (let i = 0; i < 7; i++) {
			const d = new Date(monday);
			d.setDate(monday.getDate() + i);
			out.push(ymd(d));
		}
		return out;
	});

	// All upcoming events from today onward, grouped by date for the agenda list.
	let agendaGroups = $derived.by(() => {
		const future = events
			.filter((e) => e.date >= todayKey)
			.sort((a, b) => {
				const c = a.date.localeCompare(b.date);
				return c !== 0 ? c : (a.time ?? '99:99').localeCompare(b.time ?? '99:99');
			});
		const groups: { date: string; items: CalendarEvent[] }[] = [];
		for (const e of future) {
			const last = groups[groups.length - 1];
			if (last && last.date === e.date) last.items.push(e);
			else groups.push({ date: e.date, items: [e] });
		}
		return groups;
	});

	function dayNum(key: string): number {
		return parseInt(key.slice(8), 10);
	}

	// Short weekday label (Mon..Sun) for a given date key.
	function weekdayLabel(key: string): string {
		const idx = (keyToDate(key).getDay() + 6) % 7;
		return WEEKDAYS[idx];
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

	function shiftWeek(delta: number) {
		const d = keyToDate(selectedDate);
		d.setDate(d.getDate() + delta * 7);
		selectedDate = ymd(d);
		formErr = '';
	}
	function prevWeek() {
		shiftWeek(-1);
	}
	function nextWeek() {
		shiftWeek(1);
	}

	function selectDay(key: string) {
		selectedDate = key;
		// Keep the month grid in sync when a day from another month is picked.
		const d = keyToDate(key);
		viewYear = d.getFullYear();
		viewMonth = d.getMonth();
		formErr = '';
	}

	async function load() {
		loading = true;
		errMsg = '';
		try {
			const res = await fetch('/api/calendar');
			if (!res.ok) throw new Error(i18n.t('calendar.loadFailed'));
			const data = await res.json();
			events = Array.isArray(data?.events) ? data.events : [];
		} catch (e) {
			errMsg = e instanceof Error ? e.message : i18n.t('calendar.unknownError');
		} finally {
			loading = false;
		}
	}

	async function addEvent(ev: SubmitEvent) {
		ev.preventDefault();
		formErr = '';
		const title = fTitle.trim();
		if (!title) {
			formErr = i18n.t('calendar.titleRequired');
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
				throw new Error(d?.message || i18n.t('calendar.saveFailed'));
			}
			const d = await res.json();
			if (d?.event) events = [...events, d.event];
			fTitle = '';
			fTime = '';
			fNotes = '';
		} catch (e) {
			formErr = e instanceof Error ? e.message : i18n.t('calendar.unknownError');
		} finally {
			saving = false;
		}
	}

	async function deleteEvent(id: string) {
		if (!confirm(i18n.t('calendar.deleteEventConfirm'))) return;
		try {
			const res = await fetch(`/api/calendar?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
			if (!res.ok) throw new Error();
			events = events.filter((e) => e.id !== id);
		} catch {
			errMsg = i18n.t('calendar.deleteFailed');
		}
	}

	onMount(load);
</script>

<AppHeader title={i18n.t('calendar.title')} eyebrow={i18n.t('calendar.eyebrow')}>
	<div class="segmented" role="group" aria-label={i18n.t('calendar.title')}>
		<button class="seg" class:active={view === 'month'} onclick={() => (view = 'month')}>{i18n.t('calendar.viewMonth')}</button>
		<button class="seg" class:active={view === 'week'} onclick={() => (view = 'week')}>{i18n.t('calendar.viewWeek')}</button>
		<button class="seg" class:active={view === 'agenda'} onclick={() => (view = 'agenda')}>{i18n.t('calendar.viewAgenda')}</button>
	</div>
	<button class="btn-today" onclick={goToday}>{i18n.t('calendar.today')}</button>
</AppHeader>

<div class="scroll">
	{#if errMsg}
		<div class="banner">{errMsg}</div>
	{/if}

	<div class="layout">
		<!-- Main view: month grid · week strip · agenda list -->
		<section class="cal">
			{#if view === 'month'}
				<div class="navbar">
					<button class="nav" aria-label={i18n.t('calendar.prevMonth')} onclick={prevMonth}>
						<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
					</button>
					<h2>{MONTHS[viewMonth]} {viewYear}</h2>
					<button class="nav" aria-label={i18n.t('calendar.nextMonth')} onclick={nextMonth}>
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
			{:else if view === 'week'}
				<div class="navbar">
					<button class="nav" aria-label={i18n.t('calendar.prevWeek')} onclick={prevWeek}>
						<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
					</button>
					<h2>{prettyDate(weekDays[0])} – {prettyDate(weekDays[6])}</h2>
					<button class="nav" aria-label={i18n.t('calendar.nextWeek')} onclick={nextWeek}>
						<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6" /></svg>
					</button>
				</div>

				<div class="week">
					{#each weekDays as key (key)}
						<button
							class="wday"
							class:today={key === todayKey}
							class:selected={key === selectedDate}
							onclick={() => selectDay(key)}
						>
							<div class="wday-head">
								<span class="wday-name">{weekdayLabel(key)}</span>
								<span class="wday-num">{dayNum(key)}</span>
							</div>
							{#if (byDate.get(key)?.length ?? 0) === 0}
								<span class="wday-empty">—</span>
							{:else}
								<ul class="wday-evs">
									{#each byDate.get(key) ?? [] as e (e.id)}
										<li class="wday-ev">
											{#if e.time}<span class="wday-ev-time mono">{e.time}</span>{/if}
											<span class="wday-ev-title">{e.title}</span>
										</li>
									{/each}
								</ul>
							{/if}
						</button>
					{/each}
				</div>
			{:else}
				<h2 class="agenda-title">{i18n.t('calendar.upcoming')}</h2>
				{#if loading}
					<p class="muted">{i18n.t('calendar.loading')}</p>
				{:else if agendaGroups.length === 0}
					<p class="muted">{i18n.t('calendar.noUpcoming')}</p>
				{:else}
					<div class="agenda">
						{#each agendaGroups as g (g.date)}
							<div class="agenda-group">
								<button class="agenda-date" class:today={g.date === todayKey} onclick={() => selectDay(g.date)}>
									<span class="agenda-wd">{weekdayLabel(g.date)}</span>
									<span>{prettyDate(g.date)}</span>
								</button>
								<ul class="evlist">
									{#each g.items as e (e.id)}
										<li class="ev">
											<div class="ev-main">
												<div class="ev-head">
													{#if e.time}<span class="ev-time mono">{e.time}</span>{/if}
													<span class="ev-title">{e.title}</span>
												</div>
												{#if e.notes}<p class="ev-notes">{e.notes}</p>{/if}
											</div>
											<button class="del" aria-label={i18n.t('calendar.deleteEvent')} onclick={() => deleteEvent(e.id)}>
												<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /></svg>
											</button>
										</li>
									{/each}
								</ul>
							</div>
						{/each}
					</div>
				{/if}
			{/if}
		</section>

		<!-- Side: selected day + upcoming -->
		<aside class="side">
			<section class="panel">
				<h3 class="day-title">{prettyDate(selectedDate)}</h3>

				{#if loading}
					<p class="muted">{i18n.t('calendar.loading')}</p>
				{:else if selectedEvents.length === 0}
					<p class="muted">{i18n.t('calendar.noEventsDay')}</p>
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
								<button class="del" aria-label={i18n.t('calendar.deleteEvent')} onclick={() => deleteEvent(e.id)}>
									<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /></svg>
								</button>
							</li>
						{/each}
					</ul>
				{/if}

				<form class="form" onsubmit={addEvent}>
					<input class="in" type="text" placeholder={i18n.t('calendar.titlePlaceholder')} bind:value={fTitle} maxlength="120" />
					<div class="row">
						<input class="in" type="time" bind:value={fTime} aria-label={i18n.t('calendar.time')} />
						<button class="btn-add" type="submit" disabled={saving}>
							{saving ? i18n.t('calendar.saving') : i18n.t('calendar.add')}
						</button>
					</div>
					<textarea class="in ta" placeholder={i18n.t('calendar.notePlaceholder')} bind:value={fNotes} rows="2"></textarea>
					{#if formErr}<span class="form-err">{formErr}</span>{/if}
				</form>
			</section>

			<section class="panel">
				<h3 class="day-title">{i18n.t('calendar.upcoming')}</h3>
				{#if upcoming.length === 0}
					<p class="muted">{i18n.t('calendar.noUpcoming')}</p>
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

	/* View switcher */
	.segmented {
		display: inline-flex;
		gap: 2px;
		padding: 2px;
		border-radius: 999px;
		border: 1px solid var(--border-soft);
		background: var(--surface-1);
	}
	.seg {
		padding: 5px 13px;
		border-radius: 999px;
		border: 1px solid transparent;
		background: transparent;
		color: var(--text-muted);
		font-size: 12px;
		font-family: var(--font-body);
		cursor: pointer;
	}
	.seg:hover {
		color: var(--text);
	}
	.seg.active {
		background: var(--ember-soft);
		border-color: var(--ember-line);
		color: var(--ember-bright);
	}

	/* Week view */
	.week {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.wday {
		display: flex;
		align-items: flex-start;
		gap: 12px;
		padding: 10px 12px;
		border-radius: var(--radius-sm);
		border: 1px solid var(--border-soft);
		background: var(--surface-2);
		color: var(--text);
		font-family: var(--font-body);
		text-align: left;
		cursor: pointer;
		transition: border-color 0.12s, background 0.12s;
	}
	.wday:hover {
		border-color: var(--ember-line);
	}
	.wday.today {
		border-color: var(--ember-line);
		background: var(--ember-soft);
	}
	.wday.selected {
		outline: 2px solid var(--ember);
		outline-offset: -1px;
	}
	.wday-head {
		flex: none;
		display: flex;
		flex-direction: column;
		align-items: center;
		min-width: 44px;
	}
	.wday-name {
		font-size: 11px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-faint);
	}
	.wday.today .wday-name,
	.wday.today .wday-num {
		color: var(--ember-bright);
	}
	.wday-num {
		font-size: 18px;
		color: var(--text);
	}
	.wday-empty {
		align-self: center;
		font-size: 13px;
		color: var(--text-faint);
	}
	.wday-evs {
		list-style: none;
		padding: 0;
		margin: 0;
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 4px;
		align-self: center;
	}
	.wday-ev {
		display: flex;
		align-items: baseline;
		gap: 8px;
	}
	.wday-ev-time {
		flex: none;
		font-size: 12px;
		color: var(--ember-bright);
		min-width: 42px;
	}
	.wday-ev-title {
		font-size: 13.5px;
		color: var(--text);
	}

	/* Agenda view */
	.agenda-title {
		font-size: 17px;
		margin-bottom: 16px;
	}
	.agenda {
		display: flex;
		flex-direction: column;
		gap: 18px;
	}
	.agenda-group {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.agenda-date {
		display: flex;
		align-items: baseline;
		gap: 8px;
		padding: 4px 0;
		border: none;
		background: transparent;
		color: var(--text-muted);
		font-family: var(--font-body);
		font-size: 13px;
		text-align: left;
		cursor: pointer;
	}
	.agenda-date:hover {
		color: var(--text);
	}
	.agenda-date.today {
		color: var(--ember-bright);
	}
	.agenda-wd {
		font-size: 11px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-faint);
		min-width: 28px;
	}
	.agenda-date.today .agenda-wd {
		color: var(--ember-bright);
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
