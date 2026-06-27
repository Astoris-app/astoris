import { json } from '@sveltejs/kit';
import { getCompany } from '$lib/server/company';
import { getCrm } from '$lib/server/crm';
import { getMetrics } from '$lib/server/metrics';
import { getExperiments } from '$lib/server/optimization';

// Aggregierter Live-Status für die Lobby (/uebersicht).
// Jede Datenquelle ist einzeln in try/catch gekapselt — eine kaputte oder
// fehlende Datei darf die Übersicht NIE zum Absturz bringen (read-only).

type Overview = {
	goals: { aktiv: number; gesamt: number; erledigt: number };
	agents: number;
	tasks: { offen: number; wartetFreigabe: number };
	leads: number;
	kunden: number;
	dealsOffen: number;
	kpis: number;
	experimente: { offen: number; gesamt: number };
};

export async function GET() {
	const out: Overview = {
		goals: { aktiv: 0, gesamt: 0, erledigt: 0 },
		agents: 0,
		tasks: { offen: 0, wartetFreigabe: 0 },
		leads: 0,
		kunden: 0,
		dealsOffen: 0,
		kpis: 0,
		experimente: { offen: 0, gesamt: 0 }
	};

	// ---------- Firma: Ziele, Agenten, Aufgaben ----------
	try {
		const c = getCompany();
		const goals = Array.isArray(c.goals) ? c.goals : [];
		out.goals.gesamt = goals.length;
		out.goals.aktiv = goals.filter((g) => g.status === 'aktiv').length;
		out.goals.erledigt = goals.filter((g) => g.status === 'erledigt').length;
		out.agents = Array.isArray(c.agents) ? c.agents.length : 0;
		const tasks = Array.isArray(c.tasks) ? c.tasks : [];
		out.tasks.offen = tasks.filter((t) => t.status === 'offen' || t.status === 'in-arbeit').length;
		out.tasks.wartetFreigabe = tasks.filter((t) => t.status === 'wartet-freigabe').length;
	} catch { /* Firma-Quelle nicht verfügbar — Defaults beibehalten */ }

	// ---------- CRM: Leads, Kunden, offene Deals ----------
	try {
		const crm = getCrm();
		const contacts = Array.isArray(crm.contacts) ? crm.contacts : [];
		out.leads = contacts.filter((c) => c.type === 'lead').length;
		out.kunden = contacts.filter((c) => c.type === 'kunde').length;
		const deals = Array.isArray(crm.deals) ? crm.deals : [];
		out.dealsOffen = deals.filter((d) => d.stage !== 'gewonnen' && d.stage !== 'verloren').length;
	} catch { /* CRM-Quelle nicht verfügbar */ }

	// ---------- Kennzahlen ----------
	try {
		const m = getMetrics();
		out.kpis = Array.isArray(m.metrics) ? m.metrics.length : 0;
	} catch { /* Metrics-Quelle nicht verfügbar */ }

	// ---------- Optimierung: Experimente ----------
	try {
		const exp = getExperiments();
		const list = Array.isArray(exp) ? exp : [];
		out.experimente.gesamt = list.length;
		out.experimente.offen = list.filter((e) => e.status !== 'ausgewertet').length;
	} catch { /* Optimization-Quelle nicht verfügbar */ }

	return json(out);
}
