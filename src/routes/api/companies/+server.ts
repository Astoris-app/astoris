// Multi-Company-API: Firmen auflisten, umschalten, anlegen, umbenennen, entfernen.
// Die firma-spezifischen Schreib-Funktionen (saveCompany/addRole/addAgent/addGoal)
// zielen IMMER auf die AKTIVE Firma (companyDir) — daher MUSS setActiveId vor dem
// Befüllen einer neu angelegten Firma stehen.

import { json } from '@sveltejs/kit';
import {
	listCompanies, getActiveId, setActiveId, createCompany, renameCompany, removeCompany
} from '$lib/server/companies';
import { saveCompany, addRole, addAgent, addGoal, INDUSTRY_TEMPLATES } from '$lib/server/company';

// Heuristische Persona-Zuordnung für die Template-Agenten (Default: 'astoris', existiert immer als Builtin).
function pickPersona(roleTitle: string): string {
	const t = roleTitle.toLowerCase();
	if (/(entwickl|developer|qa|test|technik)/.test(t)) return 'code';
	if (/(design|visual|ux|ui)/.test(t)) return 'kreativ';
	if (/(text|copy|lektor|redaktion)/.test(t)) return 'lektor';
	if (/(marketing|vertrieb|sales|account|support|einkauf|versand)/.test(t)) return 'vertrieb';
	if (/(analyst|research|recherche)/.test(t)) return 'analyst';
	if (/(chef|direktor|leit|produkt|strateg|berat)/.test(t)) return 'stratege';
	return 'astoris';
}

export async function GET() {
	return json({ companies: listCompanies(), active: getActiveId() });
}

export async function POST({ request }) {
	const b = await request.json().catch(() => ({}));
	const action = b?.action;

	// Aktive Firma umschalten.
	if (action === 'switch') {
		const meta = setActiveId((b.id ?? '').toString());
		if (!meta) return json({ error: 'Firma nicht gefunden.' }, { status: 404 });
		return json({ active: meta.id, companies: listCompanies() });
	}

	// Neue Firma anlegen + (optional) befüllen. Reihenfolge ist kritisch (siehe Kopf).
	if (action === 'create') {
		const name = (b.name ?? '').toString().trim();
		if (!name) return json({ error: 'Firmenname fehlt.' }, { status: 400 });
		const industry = (b.industry ?? '').toString().trim();

		// 1) anlegen, 2) aktiv schalten (sonst schreiben die folgenden Calls in die falsche Firma).
		const meta = createCompany({ name, industry });
		setActiveId(meta.id);

		// 3) Stammdaten in die jetzt aktive Firma schreiben.
		saveCompany({
			name,
			industry,
			mission: (b.mission ?? '').toString(),
			knowledge: (b.knowledge ?? '').toString()
		});

		// 4) Branchen-Vorlage übernehmen: Rollen + je Rolle ein passender Agent (wie apply-template, plus Team).
		if (b.template) {
			const tpl = INDUSTRY_TEMPLATES[industry];
			if (tpl) {
				for (const r of tpl.roles) {
					addRole(r.title, r.description);
					addAgent(r.title, r.title, pickPersona(r.title));
				}
			}
		}

		// 5) Erste Ziele anlegen (optional).
		if (Array.isArray(b.goals)) {
			for (const g of b.goals) {
				const title = (g ?? '').toString().trim();
				if (title) addGoal({ title });
			}
		}

		return json({ id: meta.id, active: getActiveId(), companies: listCompanies() });
	}

	// Firma umbenennen.
	if (action === 'rename') {
		const meta = renameCompany((b.id ?? '').toString(), (b.name ?? '').toString());
		if (!meta) return json({ error: 'Firma nicht gefunden.' }, { status: 404 });
		return json({ companies: listCompanies(), active: getActiveId() });
	}

	// Firma sicher entfernen (verschiebt nach .trash, nie die letzte Firma).
	if (action === 'delete') {
		removeCompany((b.id ?? '').toString());
		return json({ companies: listCompanies(), active: getActiveId() });
	}

	return json({ error: 'Unbekannte Aktion.' }, { status: 400 });
}
