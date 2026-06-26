import { json } from '@sveltejs/kit';
import {
	getCompany, saveCompany, addRole, removeRole, addAgent, removeAgent,
	setAgentModel, setAgentTools, addAgentHistory, clearAgentHistory,
	INDUSTRY_TEMPLATES, type Company, type Agent
} from '$lib/server/company';
import { getPersona } from '$lib/server/personas';
import { engineChat } from '$lib/server/engine';

// Baut den System-Kontext eines Agenten (Persona + Rolle + Firma + Wissensbasis).
function agentContext(c: Company, agent: Agent): string {
	const persona = getPersona(agent.personaId);
	return [
		`Du bist ${agent.name}, ${agent.role}${c.name ? ' bei ' + c.name : ''}.`,
		persona?.systemPrompt ?? '',
		c.mission ? 'Mission der Firma: ' + c.mission : '',
		c.knowledge ? 'Wissen über die Firma (berücksichtige es):\n' + c.knowledge : ''
	].filter(Boolean).join('\n\n');
}

// Lässt einen Agenten eine Aufgabe bearbeiten (mit seinem Modell + erlaubten Werkzeugen) und speichert den Verlauf.
async function runAgentTask(c: Company, agent: Agent, task: string) {
	const ctx = agentContext(c, agent);
	const result = await engineChat(
		[{ role: 'system', content: ctx }, { role: 'user', content: task }],
		agent.model,
		agent.tools
	);
	addAgentHistory(agent.id, { task, result: result.reply, at: new Date().toISOString() });
	return result;
}

export async function GET() {
	return json({ company: getCompany(), templates: INDUSTRY_TEMPLATES });
}

export async function POST({ request }) {
	const b = await request.json().catch(() => ({}));
	const action = b?.action;
	if (action === 'save') return json({ company: saveCompany({ name: b.name, industry: b.industry, mission: b.mission }) });
	if (action === 'set-knowledge') return json({ company: saveCompany({ knowledge: (b.knowledge ?? '').toString() }) });
	if (action === 'add-role') return json({ company: addRole((b.title ?? '').toString(), (b.description ?? '').toString()) });
	if (action === 'remove-role') return json({ company: removeRole((b.id ?? '').toString()) });
	if (action === 'add-agent') return json({ company: addAgent((b.name ?? '').toString(), (b.role ?? '').toString(), (b.personaId ?? '').toString()) });
	if (action === 'remove-agent') return json({ company: removeAgent((b.id ?? '').toString()) });
	if (action === 'set-agent-model') return json({ company: setAgentModel((b.agentId ?? '').toString(), b.model ?? null) });
	if (action === 'set-agent-tools') return json({ company: setAgentTools((b.agentId ?? '').toString(), Array.isArray(b.tools) ? b.tools.map(String) : []) });
	if (action === 'clear-history') return json({ company: clearAgentHistory((b.agentId ?? '').toString()) });

	// Einzelner Agent bearbeitet eine Aufgabe.
	if (action === 'run-agent') {
		const c = getCompany();
		const agent = c.agents.find((a) => a.id === (b.agentId ?? '').toString());
		if (!agent) return json({ error: 'Agent nicht gefunden.' }, { status: 404 });
		const task = (b.task ?? '').toString().trim();
		if (!task) return json({ error: 'Aufgabe fehlt.' }, { status: 400 });
		const result = await runAgentTask(c, agent, task);
		return json({ result: result.reply, source: result.source, company: getCompany() });
	}

	// Orchestrierung: Koordinator zerlegt die Aufgabe, delegiert an Agenten, fasst zusammen.
	if (action === 'run-company') {
		const c = getCompany();
		const task = (b.task ?? '').toString().trim();
		if (!task) return json({ error: 'Aufgabe fehlt.' }, { status: 400 });
		if (!c.agents.length) return json({ error: 'Keine Agenten in der Firma.' }, { status: 400 });

		const roster = c.agents.map((a) => `- ${a.name} (${a.role})`).join('\n');
		const planPrompt = `Du bist Projektkoordinator${c.name ? ' bei ' + c.name : ''}.\nTeam:\n${roster}\n\nGesamtaufgabe: ${task}\n\nVerteile die Aufgabe auf die passenden Teammitglieder (nur die nötigen, max 4). Antworte AUSSCHLIESSLICH als JSON-Array, ohne weiteren Text: [{"agent":"<exakter Name>","auftrag":"<konkreter Teilauftrag>"}]`;
		const plan = await engineChat([{ role: 'user', content: planPrompt }]);
		let assignments: { agent: string; auftrag: string }[] = [];
		try {
			const m = plan.reply.match(/\[[\s\S]*\]/);
			if (m) assignments = JSON.parse(m[0]);
		} catch {
			assignments = [];
		}

		const breakdown: { agent: string; role: string; auftrag: string; ergebnis: string }[] = [];
		for (const as of assignments.slice(0, 4)) {
			const agent = c.agents.find((a) => a.name.toLowerCase() === String(as?.agent ?? '').toLowerCase());
			if (!agent || !as?.auftrag) continue;
			const r = await runAgentTask(c, agent, String(as.auftrag));
			breakdown.push({ agent: agent.name, role: agent.role, auftrag: String(as.auftrag), ergebnis: r.reply });
		}

		if (!breakdown.length) {
			return json({ result: plan.reply, breakdown: [], source: plan.source, company: getCompany() });
		}
		const summaryPrompt = `Gesamtaufgabe: ${task}\n\nTeilergebnisse des Teams:\n\n${breakdown.map((r) => `### ${r.agent} (${r.role})\n${r.ergebnis}`).join('\n\n')}\n\nFasse die Teilergebnisse zu einem stimmigen, vollständigen Gesamtergebnis zusammen.`;
		const summary = await engineChat([{ role: 'user', content: summaryPrompt }]);
		return json({ result: summary.reply, breakdown, source: summary.source, company: getCompany() });
	}

	if (action === 'apply-template') {
		const tpl = INDUSTRY_TEMPLATES[(b.industry ?? '').toString()];
		if (tpl) { let c = getCompany(); for (const r of tpl.roles) c = addRole(r.title, r.description); return json({ company: c }); }
		return json({ company: getCompany() });
	}
	return json({ company: getCompany() });
}
