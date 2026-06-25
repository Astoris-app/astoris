import { json } from '@sveltejs/kit';
import { getCompany, saveCompany, addRole, removeRole, addAgent, removeAgent, setAgentModel, INDUSTRY_TEMPLATES } from '$lib/server/company';
import { getPersona } from '$lib/server/personas';
import { engineChat } from '$lib/server/engine';

export async function GET() {
	return json({ company: getCompany(), templates: INDUSTRY_TEMPLATES });
}
export async function POST({ request }) {
	const b = await request.json().catch(() => ({}));
	const action = b?.action;
	if (action === 'save') return json({ company: saveCompany({ name: b.name, industry: b.industry, mission: b.mission }) });
	if (action === 'add-role') return json({ company: addRole((b.title ?? '').toString(), (b.description ?? '').toString()) });
	if (action === 'remove-role') return json({ company: removeRole((b.id ?? '').toString()) });
	if (action === 'add-agent') return json({ company: addAgent((b.name ?? '').toString(), (b.role ?? '').toString(), (b.personaId ?? '').toString()) });
	if (action === 'remove-agent') return json({ company: removeAgent((b.id ?? '').toString()) });
	if (action === 'set-agent-model') return json({ company: setAgentModel((b.agentId ?? '').toString(), b.model ?? null) });
	// Agent eine Aufgabe bearbeiten lassen (Persona + Rolle + Firmen-Kontext als System-Prompt).
	if (action === 'run-agent') {
		const c = getCompany();
		const agent = c.agents.find((a) => a.id === (b.agentId ?? '').toString());
		if (!agent) return json({ error: 'Agent nicht gefunden.' }, { status: 404 });
		const task = (b.task ?? '').toString().trim();
		if (!task) return json({ error: 'Aufgabe fehlt.' }, { status: 400 });
		const persona = getPersona(agent.personaId);
		const ctx = [
			`Du bist ${agent.name}, ${agent.role}${c.name ? ' bei ' + c.name : ''}.`,
			persona?.systemPrompt ?? '',
			c.mission ? 'Mission der Firma: ' + c.mission : ''
		].filter(Boolean).join(' ');
		const result = await engineChat([{ role: 'system', content: ctx }, { role: 'user', content: task }], agent.model);
		return json({ result: result.reply, source: result.source });
	}
	if (action === 'apply-template') {
		const tpl = INDUSTRY_TEMPLATES[(b.industry ?? '').toString()];
		if (tpl) { let c = getCompany(); for (const r of tpl.roles) c = addRole(r.title, r.description); return json({ company: c }); }
		return json({ company: getCompany() });
	}
	return json({ company: getCompany() });
}
