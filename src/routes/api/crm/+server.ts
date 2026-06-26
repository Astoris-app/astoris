import { json } from '@sveltejs/kit';
import {
	getCrm,
	addContact, updateContact, removeContact,
	addDeal, updateDeal, removeDeal,
	addProduct, updateProduct, removeProduct,
	CONTACT_TYPES, DEAL_STAGES,
	type ContactType, type DealStage
} from '$lib/server/crm';

export async function GET() {
	return json({ crm: getCrm() });
}

export async function POST({ request }) {
	const b = await request.json().catch(() => ({}));
	const action = b?.action;
	const id = (b?.id ?? '').toString();

	// ---------- Contacts ----------
	if (action === 'add-contact') {
		const name = (b.name ?? '').toString().trim();
		if (!name) return json({ crm: getCrm() });
		addContact({
			name,
			company: (b.company ?? '').toString(),
			email: (b.email ?? '').toString(),
			phone: (b.phone ?? '').toString(),
			type: CONTACT_TYPES.includes(b.type as ContactType) ? (b.type as ContactType) : 'lead',
			notes: (b.notes ?? '').toString()
		});
		return json({ crm: getCrm() });
	}
	if (action === 'update-contact') {
		const patch: Record<string, unknown> = {};
		if ('name' in b) patch.name = (b.name ?? '').toString();
		if ('company' in b) patch.company = (b.company ?? '').toString();
		if ('email' in b) patch.email = (b.email ?? '').toString();
		if ('phone' in b) patch.phone = (b.phone ?? '').toString();
		if ('type' in b && CONTACT_TYPES.includes(b.type as ContactType)) patch.type = b.type as ContactType;
		if ('notes' in b) patch.notes = (b.notes ?? '').toString();
		updateContact(id, patch);
		return json({ crm: getCrm() });
	}
	if (action === 'remove-contact') {
		removeContact(id);
		return json({ crm: getCrm() });
	}

	// ---------- Deals ----------
	if (action === 'add-deal') {
		const title = (b.title ?? '').toString().trim();
		if (!title) return json({ crm: getCrm() });
		addDeal({
			title,
			contactId: b.contactId ? b.contactId.toString() : undefined,
			value: b.value,
			currency: (b.currency ?? '').toString(),
			stage: DEAL_STAGES.includes(b.stage as DealStage) ? (b.stage as DealStage) : 'neu',
			notes: (b.notes ?? '').toString()
		});
		return json({ crm: getCrm() });
	}
	if (action === 'update-deal') {
		const patch: Record<string, unknown> = {};
		if ('title' in b) patch.title = (b.title ?? '').toString();
		if ('contactId' in b) patch.contactId = b.contactId ? b.contactId.toString() : undefined;
		if ('value' in b) patch.value = b.value;
		if ('currency' in b) patch.currency = (b.currency ?? '').toString();
		if ('stage' in b && DEAL_STAGES.includes(b.stage as DealStage)) patch.stage = b.stage as DealStage;
		if ('notes' in b) patch.notes = (b.notes ?? '').toString();
		updateDeal(id, patch);
		return json({ crm: getCrm() });
	}
	if (action === 'remove-deal') {
		removeDeal(id);
		return json({ crm: getCrm() });
	}

	// ---------- Products ----------
	if (action === 'add-product') {
		const name = (b.name ?? '').toString().trim();
		if (!name) return json({ crm: getCrm() });
		addProduct({
			name,
			price: b.price,
			currency: (b.currency ?? '').toString(),
			description: (b.description ?? '').toString()
		});
		return json({ crm: getCrm() });
	}
	if (action === 'update-product') {
		const patch: Record<string, unknown> = {};
		if ('name' in b) patch.name = (b.name ?? '').toString();
		if ('price' in b) patch.price = b.price;
		if ('currency' in b) patch.currency = (b.currency ?? '').toString();
		if ('description' in b) patch.description = (b.description ?? '').toString();
		updateProduct(id, patch);
		return json({ crm: getCrm() });
	}
	if (action === 'remove-product') {
		removeProduct(id);
		return json({ crm: getCrm() });
	}

	return json({ crm: getCrm() });
}
