<script lang="ts">
	// Cockpit-Sektion "Selbstentwicklung": zeigt die Vorschläge des Kurators, lässt den
	// Operator sie per Allow/Deny genehmigen, wieder zurückrollen und den Loop stoppen.
	// Eigenständig — lädt/aktualisiert sich selbst über /api/curator.
	import { onMount } from 'svelte';

	type Risk = 'niedrig' | 'mittel' | 'hoch';
	type Status = 'vorgeschlagen' | 'genehmigt' | 'abgelehnt' | 'installiert' | 'zurückgerollt';
	type Test = { ok: boolean; output?: unknown; error?: string; verifierVerdict?: 'ok' | 'mangelhaft'; verifierReason?: string };
	type Addon = { id: string; name: string; description: string; inputHint?: string; code: string };
	type Proposal = {
		id: string; goalTitle?: string; gap: string; title: string; rationale: string;
		risk: Risk; addon: Addon; test: Test; status: Status;
		createdAt: string; decidedAt?: string; decidedBy?: string; reason?: string;
	};
	type AuditEntry = { at: string; action: string; actor: string; detail?: string; result?: string };

	let proposals = $state<Proposal[]>([]);
	let loopEnabled = $state(true);
	let budgets = $state<{ proposalsPerDay: number; maxAddons: number; sandboxTimeoutMs: number }>({ proposalsPerDay: 5, maxAddons: 100, sandboxTimeoutMs: 5000 });
	let installedCount = $state(0);
	let audit = $state<AuditEntry[]>([]);
	let loading = $state(true);
	let developing = $state(false);
	let rowBusy = $state<string | null>(null);
	let notice = $state('');
	let openCode = $state<string | null>(null);
	let showAudit = $state(false);

	let open = $derived(proposals.filter((p) => p.status === 'vorgeschlagen'));
	let decided = $derived(proposals.filter((p) => p.status !== 'vorgeschlagen'));

	async function load() {
		try {
			const res = await fetch('/api/curator');
			const d = await res.json();
			proposals = Array.isArray(d.proposals) ? d.proposals : [];
			loopEnabled = d.loopEnabled ?? true;
			budgets = d.budgets ?? budgets;
			installedCount = d.installedCount ?? 0;
			audit = Array.isArray(d.audit) ? d.audit : [];
		} catch {
			/* still im Cockpit lassen */
		} finally {
			loading = false;
		}
	}

	async function develop() {
		if (developing) return;
		developing = true;
		notice = 'Der Kurator sucht eine sinnvolle Erweiterung und baut sie …';
		try {
			const res = await fetch('/api/curator', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'develop' }) });
			const d = await res.json();
			notice = d.ok ? `Neuer Vorschlag: „${d.proposal?.title ?? ''}".` : (d.message || 'Kein Vorschlag erzeugt.');
			await load();
		} catch {
			notice = 'Der Kurator ist gerade nicht erreichbar.';
		} finally {
			developing = false;
		}
	}

	async function decide(id: string, decision: 'allow' | 'deny') {
		if (rowBusy) return;
		rowBusy = id;
		try {
			const res = await fetch('/api/curator', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'decide', id, decision }) });
			if (!res.ok) { const e = await res.json().catch(() => ({})); notice = e?.message || 'Aktion fehlgeschlagen.'; }
			else notice = decision === 'allow' ? 'Erweiterung installiert und aktiviert.' : 'Vorschlag abgelehnt.';
			await load();
		} catch {
			notice = 'Aktion fehlgeschlagen.';
		} finally {
			rowBusy = null;
		}
	}

	async function rollback(id: string) {
		if (rowBusy) return;
		rowBusy = id;
		try {
			await fetch('/api/curator', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'rollback', id }) });
			notice = 'Erweiterung zurückgerollt (deinstalliert).';
			await load();
		} finally {
			rowBusy = null;
		}
	}

	async function setLoop(enabled: boolean, detonate = false) {
		try {
			await fetch('/api/curator', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'loop', enabled, detonate }) });
			notice = enabled ? 'Selbstentwicklung wieder aktiv.' : (detonate ? 'NOT-AUS: Loop gestoppt, alle selbst-installierten Add-ons deaktiviert.' : 'Selbstentwicklung pausiert.');
			await load();
		} catch {
			notice = 'Schalter konnte nicht gesetzt werden.';
		}
	}

	function fmt(iso: string): string {
		try { return new Date(iso).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch { return ''; }
	}
	function statusLabel(s: Status): string {
		return { vorgeschlagen: 'offen', genehmigt: 'genehmigt', abgelehnt: 'abgelehnt', installiert: 'installiert', 'zurückgerollt': 'zurückgerollt' }[s] ?? s;
	}
	function outPreview(t: Test): string {
		if (!t.ok) return t.error || 'Fehler';
		try { return JSON.stringify(t.output).slice(0, 240); } catch { return String(t.output).slice(0, 240); }
	}

	onMount(load);
</script>

<section class="block">
	<div class="head">
		<h2 class="cat">Selbstentwicklung</h2>
		<div class="controls">
			{#if loopEnabled}
				<button class="btn primary" onclick={develop} disabled={developing}>
					{developing ? 'Arbeitet …' : 'Firma weiterentwickeln'}
				</button>
				<button class="btn danger" onclick={() => setLoop(false, true)} title="Loop stoppen + alle selbst-installierten Add-ons abschalten">Not-Aus</button>
			{:else}
				<span class="stopped">⏸ Not-Aus aktiv</span>
				<button class="btn" onclick={() => setLoop(true)}>Wieder aktivieren</button>
			{/if}
		</div>
	</div>
	<p class="lead">
		Der Kurator erkennt anhand deiner Ziele fehlende Fähigkeiten, baut sie als Add-on, testet sie in der Sandbox –
		und legt sie dir hier zur Freigabe vor. <strong>Nichts wird ohne deinen Klick installiert.</strong>
		<span class="budget">Heute-Budget {budgets.proposalsPerDay}/Tag · installiert {installedCount}/{budgets.maxAddons}</span>
	</p>

	{#if notice}<div class="notice">{notice}</div>{/if}

	{#if loading}
		<div class="muted">Lädt …</div>
	{:else}
		<!-- Offene Vorschläge -->
		{#if open.length === 0}
			<div class="empty">Keine offenen Vorschläge. Klick „Firma weiterentwickeln", damit der Kurator eine Erweiterung vorschlägt.</div>
		{:else}
			<div class="cards">
				{#each open as p (p.id)}
					<div class="card">
						<div class="card-top">
							<span class="title">{p.title}</span>
							<span class="risk risk-{p.risk}">Risiko {p.risk}</span>
						</div>
						{#if p.goalTitle}<div class="goal">Ziel: {p.goalTitle}</div>{/if}
						<div class="rationale">{p.rationale}</div>
						<div class="desc">{p.addon.description}</div>

						<div class="test">
							<span class="tag {p.test.ok ? 'ok' : 'bad'}">Sandbox {p.test.ok ? 'OK' : 'Fehler'}</span>
							{#if p.test.verifierVerdict}
								<span class="tag {p.test.verifierVerdict === 'ok' ? 'ok' : 'bad'}">Prüfer: {p.test.verifierVerdict}</span>
							{/if}
							<span class="test-detail">{p.test.verifierReason || outPreview(p.test)}</span>
						</div>

						{#if p.test.verifierVerdict === 'mangelhaft' || !p.test.ok}
							<div class="warn">Prüfung nicht bestanden — Installation nur, wenn du den Code selbst geprüft hast.</div>
						{/if}

						<button class="link" onclick={() => (openCode = openCode === p.id ? null : p.id)}>
							{openCode === p.id ? '▾ Code verbergen' : '▸ Code ansehen'}
						</button>
						{#if openCode === p.id}
							<pre class="code">{p.addon.code}</pre>
						{/if}

						<div class="actions">
							<button class="btn primary" onclick={() => decide(p.id, 'allow')} disabled={rowBusy === p.id}>Allow — installieren</button>
							<button class="btn ghost" onclick={() => decide(p.id, 'deny')} disabled={rowBusy === p.id}>Deny — ablehnen</button>
						</div>
					</div>
				{/each}
			</div>
		{/if}

		<!-- Verlauf -->
		{#if decided.length}
			<h3 class="sub">Verlauf</h3>
			<div class="history">
				{#each decided.slice(0, 15) as p (p.id)}
					<div class="hrow">
						<span class="hstatus s-{p.status}">{statusLabel(p.status)}</span>
						<span class="htitle">{p.title}</span>
						<span class="hmeta">{p.decidedBy ? p.decidedBy + ' · ' : ''}{fmt(p.decidedAt || p.createdAt)}</span>
						{#if p.status === 'installiert'}
							<button class="link danger" onclick={() => rollback(p.id)} disabled={rowBusy === p.id}>zurückrollen</button>
						{/if}
					</div>
				{/each}
			</div>
		{/if}

		<!-- Audit -->
		{#if audit.length}
			<button class="link" onclick={() => (showAudit = !showAudit)}>{showAudit ? '▾ Prüf-Protokoll verbergen' : '▸ Prüf-Protokoll'}</button>
			{#if showAudit}
				<div class="audit">
					{#each audit as a}
						<div class="arow"><span class="atime">{fmt(a.at)}</span><span class="aaction">{a.action}</span><span class="aactor">{a.actor}</span><span class="adetail">{a.detail || a.result || ''}</span></div>
					{/each}
				</div>
			{/if}
		{/if}
	{/if}
</section>

<style>
	.block { margin-top: 26px; }
	.head { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
	.cat { font-size: 13px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-muted); margin: 0; }
	.controls { display: flex; gap: 8px; align-items: center; }
	.lead { font-size: 13px; color: var(--text-muted); margin: 8px 0 14px; line-height: 1.5; }
	.lead strong { color: var(--text); }
	.budget { display: block; margin-top: 4px; font-size: 12px; opacity: 0.8; }
	.notice { font-size: 13px; background: var(--ember-soft); border: 1px solid var(--ember-line); color: var(--text); padding: 8px 12px; border-radius: var(--radius-sm); margin-bottom: 12px; }
	.muted, .empty { font-size: 13px; color: var(--text-muted); }
	.empty { background: var(--surface-1); border: 1px dashed var(--border-soft); border-radius: var(--radius-sm); padding: 16px; }

	.cards { display: flex; flex-direction: column; gap: 12px; }
	.card { background: var(--surface-1); border: 1px solid var(--border-soft); border-radius: var(--radius-sm); padding: 14px 16px; }
	.card-top { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
	.title { font-size: 14.5px; font-weight: 650; }
	.goal { font-size: 12px; color: var(--sage); margin-top: 3px; }
	.rationale { font-size: 13px; margin-top: 6px; }
	.desc { font-size: 12.5px; color: var(--text-muted); margin-top: 4px; }

	.risk { font-size: 11px; padding: 2px 8px; border-radius: 999px; border: 1px solid var(--border-soft); flex: none; }
	.risk-niedrig { color: var(--sage); border-color: var(--sage); }
	.risk-mittel { color: var(--ember-bright); border-color: var(--ember-line); background: var(--ember-soft); }
	.risk-hoch { color: #e5484d; border-color: #e5484d; }

	.test { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: 10px; }
	.tag { font-size: 11px; padding: 2px 8px; border-radius: 6px; border: 1px solid var(--border-soft); }
	.tag.ok { color: var(--sage); border-color: var(--sage); }
	.tag.bad { color: #e5484d; border-color: #e5484d; }
	.test-detail { font-size: 12px; color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; }
	.warn { font-size: 12px; color: #e5484d; margin-top: 8px; }

	.link { background: none; border: none; color: var(--text-muted); font-size: 12px; cursor: pointer; padding: 8px 0 0; text-align: left; }
	.link:hover { color: var(--ember-bright); }
	.link.danger:hover { color: #e5484d; }
	.code { margin-top: 8px; background: var(--surface-2); border: 1px solid var(--border-soft); border-radius: var(--radius-sm); padding: 12px; font-size: 12px; overflow-x: auto; white-space: pre; max-height: 320px; }

	.actions { display: flex; gap: 8px; margin-top: 12px; }
	.btn { font-size: 13px; padding: 7px 14px; border-radius: 9px; border: 1px solid var(--border-soft); background: var(--surface-2); color: var(--text); cursor: pointer; }
	.btn:hover { border-color: var(--ember-line); }
	.btn:disabled { opacity: 0.5; cursor: default; }
	.btn.primary { background: var(--ember-soft); border-color: var(--ember-line); color: var(--ember-bright); font-weight: 600; }
	.btn.ghost { background: none; }
	.btn.danger { color: #e5484d; border-color: #e5484d; }
	.stopped { font-size: 13px; color: #e5484d; font-weight: 600; }

	.sub { font-size: 12px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-muted); margin: 22px 0 8px; }
	.history { display: flex; flex-direction: column; gap: 4px; }
	.hrow { display: flex; align-items: center; gap: 10px; font-size: 12.5px; padding: 6px 0; border-bottom: 1px solid var(--border-soft); }
	.htitle { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.hmeta { font-size: 11px; color: var(--text-muted); }
	.hstatus { font-size: 11px; padding: 2px 8px; border-radius: 6px; border: 1px solid var(--border-soft); flex: none; }
	.s-installiert { color: var(--sage); border-color: var(--sage); }
	.s-abgelehnt { color: var(--text-muted); }
	.s-zurückgerollt { color: var(--ember-bright); }

	.audit { margin-top: 8px; display: flex; flex-direction: column; gap: 2px; }
	.arow { display: flex; gap: 10px; font-size: 11.5px; color: var(--text-muted); }
	.atime { flex: none; opacity: 0.7; }
	.aaction { flex: none; color: var(--text); min-width: 130px; }
	.aactor { flex: none; opacity: 0.8; }
	.adetail { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
