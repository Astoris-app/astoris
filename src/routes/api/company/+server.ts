import { json } from '@sveltejs/kit';
import {
	getCompany, saveCompany, addRole, removeRole, addAgent, removeAgent,
	setAgentModel, setAgentTools, addAgentHistory, clearAgentHistory,
	addGoal, updateGoal, removeGoal, setGoalStatus, updateGoalMetric,
	addFeedEntry, clearFeed,
	INDUSTRY_TEMPLATES, type Company, type Agent, type GoalStatus, type GoalPriority, type GoalMetric, type FeedEntry
} from '$lib/server/company';
import { getPersona } from '$lib/server/personas';
import { engineChat } from '$lib/server/engine';

// Normalisiert eine eingehende Metrik (oder null, wenn unbrauchbar/leer).
function parseMetric(m: unknown): GoalMetric | undefined {
	if (!m || typeof m !== 'object') return undefined;
	const o = m as Record<string, unknown>;
	const name = (o.name ?? '').toString().trim();
	const unit = (o.unit ?? '').toString().trim();
	const target = Number(o.target);
	const current = Number(o.current);
	if (!name && !unit && !Number.isFinite(target) && !Number.isFinite(current)) return undefined;
	return {
		name,
		unit,
		target: Number.isFinite(target) ? target : 0,
		current: Number.isFinite(current) ? current : 0
	};
}

// Kürzt einen Text für die Feed-Anzeige (eine Zeile, knapp).
function shorten(s: string, max = 120): string {
	const t = (s ?? '').toString().replace(/\s+/g, ' ').trim();
	return t.length > max ? t.slice(0, max - 1).trimEnd() + '…' : t;
}

// Schreibt einen Feed-Eintrag, ohne den Haupt-Flow zu brechen (skip-on-fail).
function feed(entry: Omit<FeedEntry, 'id' | 'at'>) {
	try { addFeedEntry(entry); } catch { /* feed write must never break the main flow */ }
}

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

	// ---------- Goals ----------
	if (action === 'add-goal') {
		const title = (b.title ?? '').toString().trim();
		addGoal({
			title,
			description: (b.description ?? '').toString(),
			parentId: b.parentId ? b.parentId.toString() : null,
			status: b.status as GoalStatus,
			metric: parseMetric(b.metric),
			deadline: (b.deadline ?? '').toString(),
			priority: b.priority as GoalPriority,
			agentIds: Array.isArray(b.agentIds) ? b.agentIds.map(String) : []
		});
		if (title) feed({ type: 'goal', title: 'Neues Ziel: ' + shorten(title, 80) });
		return json({ company: getCompany() });
	}
	if (action === 'update-goal') {
		const patch: Record<string, unknown> = {};
		if ('title' in b) patch.title = (b.title ?? '').toString();
		if ('description' in b) patch.description = (b.description ?? '').toString();
		if ('status' in b) patch.status = b.status as GoalStatus;
		if ('priority' in b) patch.priority = b.priority as GoalPriority;
		if ('deadline' in b) patch.deadline = (b.deadline ?? '').toString();
		if ('metric' in b) patch.metric = parseMetric(b.metric);
		if ('parentId' in b) patch.parentId = b.parentId ? b.parentId.toString() : null;
		if (Array.isArray(b.agentIds)) patch.agentIds = b.agentIds.map(String);
		return json({ company: updateGoal((b.id ?? '').toString(), patch) });
	}
	if (action === 'remove-goal') return json({ company: removeGoal((b.id ?? '').toString()) });
	if (action === 'set-goal-status') {
		const id = (b.id ?? '').toString();
		const status = b.status as GoalStatus;
		const company = setGoalStatus(id, status);
		const g = (company.goals ?? []).find((x) => x.id === id);
		if (g) feed({ type: 'goal', title: `Ziel „${shorten(g.title, 60)}" → ${g.status}` });
		return json({ company: getCompany() });
	}
	if (action === 'update-goal-metric') return json({ company: updateGoalMetric((b.id ?? '').toString(), parseMetric(b.metric) ?? null) });

	// Einzelner Agent bearbeitet eine Aufgabe.
	if (action === 'run-agent') {
		const c = getCompany();
		const agent = c.agents.find((a) => a.id === (b.agentId ?? '').toString());
		if (!agent) return json({ error: 'Agent nicht gefunden.' }, { status: 404 });
		const task = (b.task ?? '').toString().trim();
		if (!task) return json({ error: 'Aufgabe fehlt.' }, { status: 400 });
		const result = await runAgentTask(c, agent, task);
		feed({ type: 'agent-task', agentId: agent.id, agentName: agent.name, title: `${agent.name} bearbeitete eine Aufgabe`, detail: shorten(task) });
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
		feed({ type: 'company-run', title: 'Firma bearbeitete: ' + shorten(task, 90), detail: `${breakdown.length} Agenten beteiligt` });
		return json({ result: summary.reply, breakdown, source: summary.source, company: getCompany() });
	}

	if (action === 'clear-feed') return json({ company: clearFeed() });

	if (action === 'apply-template') {
		const tpl = INDUSTRY_TEMPLATES[(b.industry ?? '').toString()];
		if (tpl) { let c = getCompany(); for (const r of tpl.roles) c = addRole(r.title, r.description); return json({ company: c }); }
		return json({ company: getCompany() });
	}
	return json({ company: getCompany() });
}
