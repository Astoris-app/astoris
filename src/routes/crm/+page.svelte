<script lang="ts">
	import { onMount } from 'svelte';
	import AppHeader from '$lib/components/AppHeader.svelte';
	import { i18n } from '$lib/stores/i18n.svelte';
	import { dictation } from '$lib/actions/dictation';

	// ---------- Types ----------
	type ContactType = 'lead' | 'kunde' | 'kontakt';
	type Contact = {
		id: string;
		name: string;
		company?: string;
		email?: string;
		phone?: string;
		type: ContactType;
		notes?: string;
		createdAt: string;
	};
	type DealStage = 'neu' | 'qualifiziert' | 'angebot' | 'gewonnen' | 'verloren';
	type Deal = {
		id: string;
		title: string;
		contactId?: string;
		value?: number;
		currency?: string;
		stage: DealStage;
		notes?: string;
		createdAt: string;
	};
	type Product = { id: string; name: string; price?: number; currency?: string; description?: string };
	type Crm = { contacts: Contact[]; deals: Deal[]; products: Product[] };

	// ---------- Constants ----------
	const CONTACT_TYPES: ContactType[] = ['lead', 'kunde', 'kontakt'];
	const DEAL_STAGES: DealStage[] = ['neu', 'qualifiziert', 'angebot', 'gewonnen', 'verloren'];
	// Stages counted as "open" for the open-value sum at the top of the pipeline.
	const OPEN_STAGES: DealStage[] = ['neu', 'qualifiziert', 'angebot'];

	function typeLabel(t: ContactType): string {
		const map: Record<ContactType, string> = { lead: 'typeLead', kunde: 'typeKunde', kontakt: 'typeKontakt' };
		return i18n.t('crm.' + map[t]);
	}
	function stageLabel(s: DealStage): string {
		const map: Record<DealStage, string> = {
			neu: 'stageNeu', qualifiziert: 'stageQualifiziert', angebot: 'stageAngebot',
			gewonnen: 'stageGewonnen', verloren: 'stageVerloren'
		};
		return i18n.t('crm.' + map[s]);
	}

	// ---------- State ----------
	let tab = $state<'contacts' | 'pipeline' | 'products'>('contacts');
	let crm = $state<Crm>({ contacts: [], deals: [], products: [] });
	let loading = $state(true);

	// ---------- Loaders ----------
	function applyCrm(c: any) {
		crm = {
			contacts: Array.isArray(c?.contacts) ? c.contacts : [],
			deals: Array.isArray(c?.deals) ? c.deals : [],
			products: Array.isArray(c?.products) ? c.products : []
		};
	}
	async function loadCrm() {
		try {
			const res = await fetch('/api/crm');
			const data = await res.json();
			applyCrm(data?.crm ?? {});
		} catch {
			applyCrm({});
		}
	}
	async function post(payload: Record<string, unknown>): Promise<boolean> {
		try {
			const res = await fetch('/api/crm', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(payload)
			});
			if (!res.ok) return false;
			const data = await res.json();
			if (data?.crm) applyCrm(data.crm);
			return true;
		} catch {
			return false;
		}
	}

	onMount(async () => {
		await loadCrm();
		loading = false;
	});

	// ---------- Helpers ----------
	function contactName(id?: string): string {
		if (!id) return '';
		return crm.contacts.find((c) => c.id === id)?.name ?? '';
	}
	function fmtMoney(value?: number, currency?: string): string {
		if (value == null || !Number.isFinite(value)) return '';
		const n = value.toLocaleString(i18n.lang === 'en' ? 'en-GB' : 'de-DE');
		return currency ? `${n} ${currency}` : n;
	}

	// ---------- Contacts ----------
	let contactEditor = $state<{
		open: boolean; id: string | null; name: string; company: string; email: string;
		phone: string; type: ContactType; notes: string; busy: boolean;
	}>({ open: false, id: null, name: '', company: '', email: '', phone: '', type: 'lead', notes: '', busy: false });
	let contactRowBusy = $state<string | null>(null);

	function openContactCreate() {
		contactEditor = { open: true, id: null, name: '', company: '', email: '', phone: '', type: 'lead', notes: '', busy: false };
	}
	function openContactEdit(c: Contact) {
		contactEditor = {
			open: true, id: c.id, name: c.name ?? '', company: c.company ?? '', email: c.email ?? '',
			phone: c.phone ?? '', type: c.type, notes: c.notes ?? '', busy: false
		};
	}
	function closeContactEditor() { contactEditor = { ...contactEditor, open: false }; }
	async function saveContact() {
		if (contactEditor.busy || !contactEditor.name.trim()) return;
		contactEditor.busy = true;
		const payload: Record<string, unknown> = {
			name: contactEditor.name.trim(), company: contactEditor.company.trim(), email: contactEditor.email.trim(),
			phone: contactEditor.phone.trim(), type: contactEditor.type, notes: contactEditor.notes.trim()
		};
		try {
			const ok = contactEditor.id
				? await post({ action: 'update-contact', id: contactEditor.id, ...payload })
				: await post({ action: 'add-contact', ...payload });
			if (ok) closeContactEditor();
		} finally { contactEditor.busy = false; }
	}
	async function removeContact(id: string) {
		if (contactRowBusy) return;
		if (!confirm(i18n.t('crm.removeContactConfirm'))) return;
		contactRowBusy = id;
		try { await post({ action: 'remove-contact', id }); } finally { contactRowBusy = null; }
	}

	// ---------- Deals ----------
	let dealsByStage = $derived.by<Record<DealStage, Deal[]>>(() => {
		const map: Record<DealStage, Deal[]> = { neu: [], qualifiziert: [], angebot: [], gewonnen: [], verloren: [] };
		for (const d of crm.deals) (map[d.stage] ?? map.neu).push(d);
		return map;
	});
	// Sum of open deal values, grouped by currency (mixed currencies are not added together).
	let openTotals = $derived.by<{ currency: string; sum: number }[]>(() => {
		const acc = new Map<string, number>();
		for (const d of crm.deals) {
			if (!OPEN_STAGES.includes(d.stage)) continue;
			if (d.value == null || !Number.isFinite(d.value)) continue;
			const cur = (d.currency ?? '').trim();
			acc.set(cur, (acc.get(cur) ?? 0) + d.value);
		}
		return [...acc.entries()].map(([currency, sum]) => ({ currency, sum }));
	});

	let dealEditor = $state<{
		open: boolean; id: string | null; title: string; contactId: string; value: string;
		currency: string; stage: DealStage; notes: string; busy: boolean;
	}>({ open: false, id: null, title: '', contactId: '', value: '', currency: '', stage: 'neu', notes: '', busy: false });
	let dealRowBusy = $state<string | null>(null);

	function openDealCreate(stage: DealStage = 'neu') {
		dealEditor = { open: true, id: null, title: '', contactId: '', value: '', currency: '', stage, notes: '', busy: false };
	}
	function openDealEdit(d: Deal) {
		dealEditor = {
			open: true, id: d.id, title: d.title ?? '', contactId: d.contactId ?? '',
			value: d.value != null ? String(d.value) : '', currency: d.currency ?? '', stage: d.stage, notes: d.notes ?? '', busy: false
		};
	}
	function closeDealEditor() { dealEditor = { ...dealEditor, open: false }; }
	async function saveDeal() {
		if (dealEditor.busy || !dealEditor.title.trim()) return;
		dealEditor.busy = true;
		const v = dealEditor.value.trim();
		const payload: Record<string, unknown> = {
			title: dealEditor.title.trim(), contactId: dealEditor.contactId, value: v === '' ? '' : Number(v),
			currency: dealEditor.currency.trim(), stage: dealEditor.stage, notes: dealEditor.notes.trim()
		};
		try {
			const ok = dealEditor.id
				? await post({ action: 'update-deal', id: dealEditor.id, ...payload })
				: await post({ action: 'add-deal', ...payload });
			if (ok) closeDealEditor();
		} finally { dealEditor.busy = false; }
	}
	async function setDealStage(id: string, stage: DealStage) {
		if (dealRowBusy) return;
		dealRowBusy = id;
		try { await post({ action: 'update-deal', id, stage }); } finally { dealRowBusy = null; }
	}
	async function removeDeal(id: string) {
		if (dealRowBusy) return;
		if (!confirm(i18n.t('crm.removeDealConfirm'))) return;
		dealRowBusy = id;
		try { await post({ action: 'remove-deal', id }); } finally { dealRowBusy = null; }
	}

	// ---------- Products ----------
	let productEditor = $state<{
		open: boolean; id: string | null; name: string; price: string; currency: string; description: string; busy: boolean;
	}>({ open: false, id: null, name: '', price: '', currency: '', description: '', busy: false });
	let productRowBusy = $state<string | null>(null);

	function openProductCreate() {
		productEditor = { open: true, id: null, name: '', price: '', currency: '', description: '', busy: false };
	}
	function openProductEdit(p: Product) {
		productEditor = {
			open: true, id: p.id, name: p.name ?? '', price: p.price != null ? String(p.price) : '',
			currency: p.currency ?? '', description: p.description ?? '', busy: false
		};
	}
	function closeProductEditor() { productEditor = { ...productEditor, open: false }; }
	async function saveProduct() {
		if (productEditor.busy || !productEditor.name.trim()) return;
		productEditor.busy = true;
		const v = productEditor.price.trim();
		const payload: Record<string, unknown> = {
			name: productEditor.name.trim(), price: v === '' ? '' : Number(v),
			currency: productEditor.currency.trim(), description: productEditor.description.trim()
		};
		try {
			const ok = productEditor.id
				? await post({ action: 'update-product', id: productEditor.id, ...payload })
				: await post({ action: 'add-product', ...payload });
			if (ok) closeProductEditor();
		} finally { productEditor.busy = false; }
	}
	async function removeProduct(id: string) {
		if (productRowBusy) return;
		if (!confirm(i18n.t('crm.removeProductConfirm'))) return;
		productRowBusy = id;
		try { await post({ action: 'remove-product', id }); } finally { productRowBusy = null; }
	}
</script>

<AppHeader title={i18n.t('crm.title')} eyebrow={i18n.t('crm.eyebrow')} />

<div class="scroll">
	<!-- Tab switcher -->
	<div class="tabs" role="tablist">
		<button class="tab" class:on={tab === 'contacts'} role="tab" aria-selected={tab === 'contacts'} onclick={() => (tab = 'contacts')}>
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
				<circle cx="12" cy="8" r="3.5" /><path d="M5 20c0-3.3 3.1-6 7-6s7 2.7 7 6" />
			</svg>
			{i18n.t('crm.tabContacts')} · {crm.contacts.length}
		</button>
		<button class="tab" class:on={tab === 'pipeline'} role="tab" aria-selected={tab === 'pipeline'} onclick={() => (tab = 'pipeline')}>
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
				<path d="M3 5h18l-7 8v6l-4 2v-8z" />
			</svg>
			{i18n.t('crm.tabPipeline')} · {crm.deals.length}
		</button>
		<button class="tab" class:on={tab === 'products'} role="tab" aria-selected={tab === 'products'} onclick={() => (tab = 'products')}>
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
				<path d="M4 7l8-4 8 4v10l-8 4-8-4z" /><path d="M4 7l8 4 8-4M12 11v10" />
			</svg>
			{i18n.t('crm.tabProducts')} · {crm.products.length}
		</button>
	</div>

	{#if loading}
		<p class="muted">{i18n.t('crm.loading')}</p>

	{:else if tab === 'contacts'}
		<!-- =================== CONTACTS =================== -->
		<div class="section-head">
			<p class="lead">{i18n.t('crm.contactsLead')}</p>
			<button class="btn primary" onclick={openContactCreate}>
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14" /></svg>
				{i18n.t('crm.newContact')}
			</button>
		</div>

		{#if crm.contacts.length === 0}
			<div class="empty">
				<span class="big">👥</span>
				<h3>{i18n.t('crm.noContacts')}</h3>
				<p>{i18n.t('crm.noContactsHint')}</p>
				<button class="btn primary" onclick={openContactCreate}>{i18n.t('crm.createFirstContact')}</button>
			</div>
		{:else}
			<div class="grid">
				{#each crm.contacts as c (c.id)}
					<article class="card contact">
						<div class="card-top">
							<strong class="card-title">{c.name}</strong>
							<span class="type-badge type-{c.type}">{typeLabel(c.type)}</span>
						</div>
						{#if c.company}<p class="card-sub">{c.company}</p>{/if}
						<div class="contact-lines">
							{#if c.email}<a class="cline" href={'mailto:' + c.email}>✉ {c.email}</a>{/if}
							{#if c.phone}<a class="cline" href={'tel:' + c.phone}>☎ {c.phone}</a>{/if}
						</div>
						{#if c.notes}<p class="card-notes">{c.notes}</p>{/if}
						<div class="card-actions">
							<button class="mini-btn" onclick={() => openContactEdit(c)}>{i18n.t('crm.edit')}</button>
							<button class="mini-btn danger" onclick={() => removeContact(c.id)} disabled={contactRowBusy === c.id}>{i18n.t('crm.delete')}</button>
						</div>
					</article>
				{/each}
			</div>
		{/if}

	{:else if tab === 'pipeline'}
		<!-- =================== PIPELINE =================== -->
		<div class="section-head">
			<div class="pl-head-left">
				<p class="lead">{i18n.t('crm.pipelineLead')}</p>
				<div class="open-total">
					<span class="open-total-label">{i18n.t('crm.openValue')}</span>
					{#if openTotals.length === 0}
						<span class="open-total-val">—</span>
					{:else}
						{#each openTotals as t (t.currency)}
							<span class="open-total-val">{fmtMoney(t.sum, t.currency) || t.sum}</span>
						{/each}
					{/if}
				</div>
			</div>
			<button class="btn primary" onclick={() => openDealCreate('neu')}>
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14" /></svg>
				{i18n.t('crm.newDeal')}
			</button>
		</div>

		{#if crm.deals.length === 0}
			<div class="empty">
				<span class="big">📊</span>
				<h3>{i18n.t('crm.noDeals')}</h3>
				<p>{i18n.t('crm.noDealsHint')}</p>
				<button class="btn primary" onclick={() => openDealCreate('neu')}>{i18n.t('crm.createFirstDeal')}</button>
			</div>
		{:else}
			<div class="pipeline">
				{#each DEAL_STAGES as st (st)}
					{@const items = dealsByStage[st]}
					<div class="stage-col">
						<div class="stage-head stage-{st}">
							<span class="stage-name">{stageLabel(st)}</span>
							<span class="stage-count">{items.length}</span>
						</div>
						<div class="stage-list">
							{#each items as d (d.id)}
								<article class="deal-card stage-{d.stage}">
									<strong class="deal-title">{d.title}</strong>
									{#if d.value != null}<span class="deal-value">{fmtMoney(d.value, d.currency)}</span>{/if}
									<span class="deal-contact">{contactName(d.contactId) || i18n.t('crm.noContactLinked')}</span>
									{#if d.notes}<p class="deal-notes">{d.notes}</p>{/if}
									<select
										class="deal-stage-select"
										value={d.stage}
										onchange={(e) => setDealStage(d.id, e.currentTarget.value as DealStage)}
										disabled={dealRowBusy === d.id}
										aria-label={i18n.t('crm.dealStage')}
									>
										{#each DEAL_STAGES as s (s)}<option value={s}>{stageLabel(s)}</option>{/each}
									</select>
									<div class="card-actions">
										<button class="mini-btn" onclick={() => openDealEdit(d)} disabled={dealRowBusy === d.id}>{i18n.t('crm.edit')}</button>
										<button class="mini-btn danger" onclick={() => removeDeal(d.id)} disabled={dealRowBusy === d.id}>{i18n.t('crm.delete')}</button>
									</div>
								</article>
							{/each}
							{#if items.length === 0}<p class="stage-empty">—</p>{/if}
						</div>
					</div>
				{/each}
			</div>
		{/if}

	{:else}
		<!-- =================== PRODUCTS =================== -->
		<div class="section-head">
			<p class="lead">{i18n.t('crm.productsLead')}</p>
			<button class="btn primary" onclick={openProductCreate}>
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14" /></svg>
				{i18n.t('crm.newProduct')}
			</button>
		</div>

		{#if crm.products.length === 0}
			<div class="empty">
				<span class="big">📦</span>
				<h3>{i18n.t('crm.noProducts')}</h3>
				<p>{i18n.t('crm.noProductsHint')}</p>
				<button class="btn primary" onclick={openProductCreate}>{i18n.t('crm.createFirstProduct')}</button>
			</div>
		{:else}
			<div class="grid">
				{#each crm.products as p (p.id)}
					<article class="card product">
						<div class="card-top">
							<strong class="card-title">{p.name}</strong>
							<span class="price-badge">{p.price != null ? fmtMoney(p.price, p.currency) : i18n.t('crm.noPrice')}</span>
						</div>
						{#if p.description}<p class="card-notes">{p.description}</p>{/if}
						<div class="card-actions">
							<button class="mini-btn" onclick={() => openProductEdit(p)}>{i18n.t('crm.edit')}</button>
							<button class="mini-btn danger" onclick={() => removeProduct(p.id)} disabled={productRowBusy === p.id}>{i18n.t('crm.delete')}</button>
						</div>
					</article>
				{/each}
			</div>
		{/if}
	{/if}
</div>

<!-- =================== CONTACT EDITOR =================== -->
{#if contactEditor.open}
	<div class="overlay" role="button" tabindex="0" onclick={closeContactEditor} onkeydown={(e) => e.key === 'Escape' && closeContactEditor()}>
		<div class="dialog" role="dialog" aria-modal="true" aria-label={i18n.t('crm.contactEditorEdit')} tabindex="-1" onclick={(e) => e.stopPropagation()} onkeydown={() => {}}>
			<div class="dhead">
				<span class="emoji big">👤</span>
				<div>
					<h3>{contactEditor.id ? i18n.t('crm.contactEditorEdit') : i18n.t('crm.contactEditorNew')}</h3>
					<span class="eyebrow">{i18n.t('crm.tabContacts')}</span>
				</div>
			</div>
			<div class="fields">
				<label>
					<span>{i18n.t('crm.name')}</span>
					<input type="text" placeholder={i18n.t('crm.contactNamePlaceholder')} bind:value={contactEditor.name} autocomplete="off" />
				</label>
				<div class="two">
					<label class="grow">
						<span>{i18n.t('crm.company')}</span>
						<input type="text" placeholder={i18n.t('crm.companyPlaceholder')} bind:value={contactEditor.company} autocomplete="off" />
					</label>
					<label class="grow">
						<span>{i18n.t('crm.type')}</span>
						<select bind:value={contactEditor.type}>
							{#each CONTACT_TYPES as t (t)}<option value={t}>{typeLabel(t)}</option>{/each}
						</select>
					</label>
				</div>
				<div class="two">
					<label class="grow">
						<span>{i18n.t('crm.email')}</span>
						<input type="email" placeholder={i18n.t('crm.emailPlaceholder')} bind:value={contactEditor.email} autocomplete="off" />
					</label>
					<label class="grow">
						<span>{i18n.t('crm.phone')}</span>
						<input type="text" placeholder={i18n.t('crm.phonePlaceholder')} bind:value={contactEditor.phone} autocomplete="off" />
					</label>
				</div>
				<label>
					<span>{i18n.t('crm.notes')}</span>
					<textarea rows="3" placeholder={i18n.t('crm.notesPlaceholder')} bind:value={contactEditor.notes} use:dictation={{ getText: () => contactEditor.notes, append: (s) => contactEditor.notes = (contactEditor.notes ? contactEditor.notes + ' ' : '') + s }}></textarea>
				</label>
			</div>
			<div class="dactions">
				<button class="btn ghost" onclick={closeContactEditor}>{i18n.t('crm.cancel')}</button>
				<button class="btn primary" onclick={saveContact} disabled={contactEditor.busy || !contactEditor.name.trim()}>
					{contactEditor.busy ? i18n.t('crm.saving') : (contactEditor.id ? i18n.t('crm.save') : i18n.t('crm.create'))}
				</button>
			</div>
		</div>
	</div>
{/if}

<!-- =================== DEAL EDITOR =================== -->
{#if dealEditor.open}
	<div class="overlay" role="button" tabindex="0" onclick={closeDealEditor} onkeydown={(e) => e.key === 'Escape' && closeDealEditor()}>
		<div class="dialog" role="dialog" aria-modal="true" aria-label={i18n.t('crm.dealEditorEdit')} tabindex="-1" onclick={(e) => e.stopPropagation()} onkeydown={() => {}}>
			<div class="dhead">
				<span class="emoji big">💼</span>
				<div>
					<h3>{dealEditor.id ? i18n.t('crm.dealEditorEdit') : i18n.t('crm.dealEditorNew')}</h3>
					<span class="eyebrow">{i18n.t('crm.tabPipeline')}</span>
				</div>
			</div>
			<div class="fields">
				<label>
					<span>{i18n.t('crm.dealTitle')}</span>
					<input type="text" placeholder={i18n.t('crm.dealTitlePlaceholder')} bind:value={dealEditor.title} autocomplete="off" />
				</label>
				<div class="two">
					<label class="grow">
						<span>{i18n.t('crm.dealContact')}</span>
						<select bind:value={dealEditor.contactId}>
							<option value="">{i18n.t('crm.dealNoContact')}</option>
							{#each crm.contacts as c (c.id)}<option value={c.id}>{c.name}</option>{/each}
						</select>
					</label>
					<label class="grow">
						<span>{i18n.t('crm.dealStage')}</span>
						<select bind:value={dealEditor.stage}>
							{#each DEAL_STAGES as s (s)}<option value={s}>{stageLabel(s)}</option>{/each}
						</select>
					</label>
				</div>
				<div class="two">
					<label class="grow">
						<span>{i18n.t('crm.dealValue')}</span>
						<input type="number" inputmode="decimal" bind:value={dealEditor.value} />
					</label>
					<label class="grow">
						<span>{i18n.t('crm.dealCurrency')}</span>
						<input type="text" placeholder={i18n.t('crm.currencyPlaceholder')} bind:value={dealEditor.currency} autocomplete="off" />
					</label>
				</div>
				<label>
					<span>{i18n.t('crm.dealNotes')}</span>
					<textarea rows="3" placeholder={i18n.t('crm.notesPlaceholder')} bind:value={dealEditor.notes} use:dictation={{ getText: () => dealEditor.notes, append: (s) => dealEditor.notes = (dealEditor.notes ? dealEditor.notes + ' ' : '') + s }}></textarea>
				</label>
			</div>
			<div class="dactions">
				<button class="btn ghost" onclick={closeDealEditor}>{i18n.t('crm.cancel')}</button>
				<button class="btn primary" onclick={saveDeal} disabled={dealEditor.busy || !dealEditor.title.trim()}>
					{dealEditor.busy ? i18n.t('crm.saving') : (dealEditor.id ? i18n.t('crm.save') : i18n.t('crm.create'))}
				</button>
			</div>
		</div>
	</div>
{/if}

<!-- =================== PRODUCT EDITOR =================== -->
{#if productEditor.open}
	<div class="overlay" role="button" tabindex="0" onclick={closeProductEditor} onkeydown={(e) => e.key === 'Escape' && closeProductEditor()}>
		<div class="dialog" role="dialog" aria-modal="true" aria-label={i18n.t('crm.productEditorEdit')} tabindex="-1" onclick={(e) => e.stopPropagation()} onkeydown={() => {}}>
			<div class="dhead">
				<span class="emoji big">📦</span>
				<div>
					<h3>{productEditor.id ? i18n.t('crm.productEditorEdit') : i18n.t('crm.productEditorNew')}</h3>
					<span class="eyebrow">{i18n.t('crm.tabProducts')}</span>
				</div>
			</div>
			<div class="fields">
				<label>
					<span>{i18n.t('crm.productName')}</span>
					<input type="text" placeholder={i18n.t('crm.productNamePlaceholder')} bind:value={productEditor.name} autocomplete="off" />
				</label>
				<div class="two">
					<label class="grow">
						<span>{i18n.t('crm.price')}</span>
						<input type="number" inputmode="decimal" bind:value={productEditor.price} />
					</label>
					<label class="grow">
						<span>{i18n.t('crm.currency')}</span>
						<input type="text" placeholder={i18n.t('crm.currencyPlaceholder')} bind:value={productEditor.currency} autocomplete="off" />
					</label>
				</div>
				<label>
					<span>{i18n.t('crm.description')}</span>
					<textarea rows="3" placeholder={i18n.t('crm.descriptionPlaceholder')} bind:value={productEditor.description} use:dictation={{ getText: () => productEditor.description, append: (s) => productEditor.description = (productEditor.description ? productEditor.description + ' ' : '') + s }}></textarea>
				</label>
			</div>
			<div class="dactions">
				<button class="btn ghost" onclick={closeProductEditor}>{i18n.t('crm.cancel')}</button>
				<button class="btn primary" onclick={saveProduct} disabled={productEditor.busy || !productEditor.name.trim()}>
					{productEditor.busy ? i18n.t('crm.saving') : (productEditor.id ? i18n.t('crm.save') : i18n.t('crm.create'))}
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.scroll { flex: 1; overflow-y: auto; padding: 24px 28px 48px; }
	.muted { color: var(--text-faint); }

	/* Tabs */
	.tabs { display: inline-flex; gap: 4px; padding: 4px; background: var(--surface-1); border: 1px solid var(--border-soft); border-radius: 999px; margin-bottom: 24px; flex-wrap: wrap; }
	.tab { display: flex; align-items: center; gap: 8px; padding: 8px 16px; border-radius: 999px; font-size: 13.5px; font-weight: 500; color: var(--text-muted); background: transparent; border: none; transition: all 0.16s; }
	.tab svg { width: 16px; height: 16px; }
	.tab:hover { color: var(--text); }
	.tab.on { background: var(--surface-3); color: var(--text); }

	.section-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; margin-bottom: 22px; }
	.lead { color: var(--text-muted); max-width: 560px; margin: 0; }
	.pl-head-left { display: flex; flex-direction: column; gap: 12px; }

	/* Open value summary */
	.open-total { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; background: var(--surface-1); border: 1px solid var(--ember-line); border-radius: var(--radius-sm); padding: 8px 14px; align-self: flex-start; }
	.open-total-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.09em; font-family: var(--font-mono); color: var(--text-faint); }
	.open-total-val { font-size: 15px; font-weight: 600; color: var(--ember-bright); }

	/* Buttons */
	.btn { display: inline-flex; align-items: center; gap: 7px; border-radius: 9px; padding: 8px 14px; font-size: 13px; font-weight: 500; border: 1px solid transparent; transition: all 0.16s; white-space: nowrap; }
	.btn svg { width: 15px; height: 15px; }
	.btn:disabled { opacity: 0.45; cursor: not-allowed; }
	.btn.primary { background: var(--ember); color: #1a1206; }
	.btn.primary:not(:disabled):hover { background: var(--ember-bright); }
	.btn.ghost { background: transparent; border-color: var(--border); color: var(--text-muted); }
	.btn.ghost:not(:disabled):hover { color: var(--text); border-color: var(--text-faint); }

	.mini-btn { font-size: 12px; color: var(--text-muted); background: var(--surface-2); border: 1px solid var(--border-soft); border-radius: 7px; padding: 5px 10px; transition: all 0.14s; }
	.mini-btn:hover { color: var(--text); border-color: var(--border); }
	.mini-btn.danger:hover { color: var(--danger); border-color: var(--danger-soft); background: var(--danger-soft); }
	.mini-btn:disabled { opacity: 0.45; cursor: not-allowed; }

	/* Cards grid (contacts + products) */
	.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 12px; }
	.card { background: var(--surface-1); border: 1px solid var(--border-soft); border-radius: var(--radius); padding: 16px; display: flex; flex-direction: column; gap: 8px; transition: border-color 0.18s, transform 0.18s var(--ease); }
	.card:hover { transform: translateY(-2px); border-color: var(--border); }
	.card-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
	.card-title { font-size: 15px; font-weight: 600; word-break: break-word; min-width: 0; }
	.card-sub { margin: 0; font-size: 13px; color: var(--text-muted); }
	.card-notes { margin: 2px 0 0; font-size: 12.5px; color: var(--text-faint); line-height: 1.5; word-break: break-word; }
	.card-actions { display: flex; gap: 7px; margin-top: auto; padding-top: 6px; }
	.contact-lines { display: flex; flex-direction: column; gap: 3px; }
	.cline { font-size: 12.5px; color: var(--text-muted); text-decoration: none; word-break: break-all; }
	.cline:hover { color: var(--ember-bright); }

	/* Type badges */
	.type-badge { flex: none; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.07em; padding: 3px 9px; border-radius: 999px; border: 1px solid var(--border-soft); color: var(--text-muted); background: var(--surface-2); white-space: nowrap; }
	.type-badge.type-lead { color: var(--ember-bright); border-color: var(--ember-line); background: var(--ember-soft); }
	.type-badge.type-kunde { color: var(--sage); border-color: var(--sage); }
	.type-badge.type-kontakt { color: var(--text-muted); border-color: var(--border-soft); }

	/* Product price */
	.price-badge { flex: none; font-size: 13px; font-weight: 600; color: var(--ember-bright); white-space: nowrap; }

	/* Empty states */
	.empty { text-align: center; padding: 48px 20px; background: var(--surface-1); border: 1px dashed var(--border); border-radius: var(--radius-lg); display: flex; flex-direction: column; align-items: center; gap: 8px; }
	.empty .big { font-size: 36px; }
	.empty h3 { font-size: 16px; }
	.empty p { margin: 0; color: var(--text-muted); font-size: 13.5px; max-width: 420px; }
	.empty .btn { margin-top: 10px; }

	/* Pipeline */
	.pipeline { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 12px; }
	.stage-col { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
	.stage-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 7px 11px; border-radius: 999px; border: 1px solid var(--border-soft); background: var(--surface-2); }
	.stage-name { font-size: 11.5px; text-transform: uppercase; letter-spacing: 0.07em; font-family: var(--font-mono); color: var(--text-muted); }
	.stage-count { font-size: 11.5px; color: var(--text-faint); font-family: var(--font-mono); }
	.stage-head.stage-neu { color: var(--text-muted); }
	.stage-head.stage-qualifiziert .stage-name { color: var(--text); }
	.stage-head.stage-angebot { border-color: var(--ember-line); }
	.stage-head.stage-angebot .stage-name { color: var(--ember-bright); }
	.stage-head.stage-gewonnen { border-color: var(--sage); }
	.stage-head.stage-gewonnen .stage-name { color: var(--sage); }
	.stage-head.stage-verloren { border-color: var(--danger-soft); }
	.stage-head.stage-verloren .stage-name { color: var(--danger); }
	.stage-list { display: flex; flex-direction: column; gap: 8px; }
	.stage-empty { margin: 0; text-align: center; color: var(--text-faint); font-size: 13px; padding: 8px 0; }

	.deal-card { background: var(--surface-1); border: 1px solid var(--border-soft); border-radius: var(--radius-sm); padding: 12px; display: flex; flex-direction: column; gap: 7px; transition: border-color 0.18s; }
	.deal-card:hover { border-color: var(--border); }
	.deal-card.stage-gewonnen { box-shadow: inset 3px 0 0 var(--sage); }
	.deal-card.stage-verloren { opacity: 0.62; }
	.deal-card.stage-verloren .deal-title { text-decoration: line-through; }
	.deal-title { font-size: 13.5px; font-weight: 600; word-break: break-word; }
	.deal-value { font-size: 13px; font-weight: 600; color: var(--ember-bright); }
	.deal-contact { font-size: 12px; color: var(--text-muted); }
	.deal-notes { margin: 0; font-size: 12px; color: var(--text-faint); line-height: 1.45; word-break: break-word; }
	.deal-stage-select { width: 100%; font-size: 12px; padding: 5px 9px; border-radius: 8px; background: var(--surface-2); border: 1px solid var(--border-soft); color: var(--text-muted); cursor: pointer; }
	.deal-stage-select:hover { border-color: var(--border); }
	.deal-stage-select:focus { outline: none; border-color: var(--ember-line); }
	.deal-stage-select:disabled { opacity: 0.5; cursor: not-allowed; }
	.deal-card .card-actions { margin-top: 2px; padding-top: 0; }

	/* Inputs (shared) */
	input[type='text'], input[type='email'], input[type='number'], textarea, select {
		width: 100%; background: var(--bg); border: 1px solid var(--border); border-radius: 9px; color: var(--text);
		padding: 10px 12px; font-family: var(--font-body); font-size: 13.5px;
	}
	textarea { resize: vertical; line-height: 1.5; }
	select { cursor: pointer; }
	input:focus, textarea:focus, select:focus { outline: none; border-color: var(--ember-line); }

	/* Dialog */
	.overlay { position: fixed; inset: 0; background: rgba(8, 6, 4, 0.66); backdrop-filter: blur(3px); display: grid; place-items: center; padding: 20px; z-index: 100; }
	.dialog { width: 100%; max-width: 480px; max-height: 88vh; overflow-y: auto; background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 22px; box-shadow: var(--shadow); }
	.dhead { display: flex; align-items: center; gap: 12px; margin-bottom: 18px; }
	.dhead h3 { font-size: 16px; }
	.emoji.big { font-size: 30px; line-height: 1; }
	.eyebrow { font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--text-faint); }
	.fields { display: flex; flex-direction: column; gap: 12px; }
	.fields .two { display: flex; gap: 12px; }
	.fields .two label.grow { flex: 1; min-width: 0; }
	.fields label span { display: block; font-size: 12.5px; color: var(--text-muted); margin-bottom: 5px; }
	.dactions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px; }

	/* Mobile */
	@media (max-width: 900px) {
		.pipeline { grid-template-columns: repeat(2, minmax(0, 1fr)); }
	}
	@media (max-width: 640px) {
		.scroll { padding: 20px 16px 40px; }
		.section-head { flex-direction: column; }
		.pipeline { grid-template-columns: 1fr; }
		.fields .two { flex-direction: column; }
		.tabs { display: flex; }
		.tab { flex: 1; justify-content: center; }
	}
</style>
