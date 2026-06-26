import { json } from '@sveltejs/kit';
import {
	getCompany, saveCompany, addRole, removeRole, addAgent, removeAgent,
	setAgentModel, setAgentTools, setAgentAutonomy, addAgentHistory, clearAgentHistory,
	addGoal, updateGoal, removeGoal, setGoalStatus, updateGoalMetric,
	addMemory, updateMemory, removeMemory,
	addTask, updateTask, removeTask, setTaskStatus,
	addFeedEntry, clearFeed,
	INDUSTRY_TEMPLATES, MEMORY_CATEGORIES, AUTONOMY_LEVELS, AUTONOMY_DEFAULT, clampAutonomy,
	type Company, type Agent, type GoalStatus, type GoalPriority, type GoalMetric, type FeedEntry, type MemoryCategory, type TaskStatus
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

// Überschriften je Memory-Kategorie für den System-Prompt.
const MEMORY_HEADINGS: Record<MemoryCategory, string> = {
	firma: 'Firmen-Wissen:',
	produkt: 'Produkt-Wissen:',
	kunde: 'Über unsere Kunden:',
	marke: 'Marken-Stimme/Tonalität:',
	entscheidung: 'Frühere Entscheidungen:',
	'nicht-tun': 'NICHT tun (Tabus):',
	experiment: 'Experimente & Ergebnisse:'
};

// Begrenzungen, damit der Prompt kompakt bleibt.
const MEMORY_MAX_PER_CAT = 8;
const MEMORY_CONTENT_MAX = 400;

// Baut den strukturierten Memory-Block (nur nicht-leere Kategorien, sinnvoll begrenzt).
function memoryBlock(c: Company): string {
	const mem = Array.isArray(c.memory) ? c.memory : [];
	if (!mem.length) return '';
	const parts: string[] = [];
	for (const cat of MEMORY_CATEGORIES) {
		const entries = mem.filter((m) => m.category === cat && (m.title?.trim() || m.content?.trim())).slice(0, MEMORY_MAX_PER_CAT);
		if (!entries.length) continue;
		const lines = entries.map((m) => {
			const title = (m.title ?? '').trim();
			const content = (m.content ?? '').trim().slice(0, MEMORY_CONTENT_MAX);
			if (title && content) return `- ${title}: ${content}`;
			return '- ' + (title || content);
		});
		parts.push(MEMORY_HEADINGS[cat] + '\n' + lines.join('\n'));
	}
	return parts.join('\n\n');
}

// Baut den Autonomie-Block: Level + konkrete Verhaltensanweisung, was der Agent (nicht) tun darf.
function autonomyBlock(agent: Agent): string {
	const lvl = clampAutonomy(agent.autonomyLevel ?? AUTONOMY_DEFAULT);
	const def = AUTONOMY_LEVELS.find((a) => a.level === lvl) ?? AUTONOMY_LEVELS[AUTONOMY_DEFAULT];
	let instruction: string;
	if (lvl <= 2) {
		// 0–2: ausdrücklich NICHTS ausführen — nur analysieren / vorschlagen / entwerfen.
		instruction =
			'Führe NICHTS aus und versende, veröffentliche oder verändere nichts. Du darfst ausschließlich analysieren, empfehlen und Entwürfe vorbereiten. ' +
			'Kennzeichne jedes Ergebnis ausdrücklich als Vorschlag und warte auf eine ausdrückliche Freigabe, bevor irgendetwas umgesetzt wird.';
	} else if (lvl === 3) {
		// 3: nur nach Freigabe handeln.
		instruction =
			'Handle ausschließlich nach ausdrücklicher Freigabe. Schlage konkrete Schritte vor und führe sie erst aus, wenn ein explizites OK vorliegt.';
	} else if (lvl === 4) {
		// 4: in klaren Grenzen selbstständig.
		instruction =
			'Du darfst innerhalb klarer, vereinbarter Grenzen selbstständig handeln und umsetzen. Bei allem, was über diese Grenzen hinausgeht, hol erst eine Freigabe ein.';
	} else {
		// 5: vollständig autonom im zugewiesenen Bereich.
		instruction =
			'Du darfst im dir zugewiesenen Bereich vollständig selbstständig handeln, entscheiden und umsetzen, ohne auf eine Freigabe zu warten.';
	}
	return `Dein Autonomie-Level: ${lvl} (${def.label}) — ${def.description}\nVerhalten: ${instruction}`;
}

// Baut den System-Kontext eines Agenten (Persona + Rolle + Firma + Autonomie + strukturierte Memory + allg. Wissen).
function agentContext(c: Company, agent: Agent): string {
	const persona = getPersona(agent.personaId);
	return [
		`Du bist ${agent.name}, ${agent.role}${c.name ? ' bei ' + c.name : ''}.`,
		persona?.systemPrompt ?? '',
		c.mission ? 'Mission der Firma: ' + c.mission : '',
		autonomyBlock(agent),
		memoryBlock(c),
		c.knowledge ? 'Allgemeines Wissen über die Firma (berücksichtige es):\n' + c.knowledge : ''
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

	// ---------- Memory (strukturiertes Firmen-Wissen) ----------
	if (action === 'add-memory') {
		const title = (b.title ?? '').toString().trim();
		const content = (b.content ?? '').toString().trim();
		if (!title && !content) return json({ company: getCompany() });
		const category = MEMORY_CATEGORIES.includes(b.category as MemoryCategory) ? (b.category as MemoryCategory) : 'firma';
		return json({ company: addMemory({ category, title, content }) });
	}
	if (action === 'update-memory') {
		const patch: Record<string, unknown> = {};
		if ('title' in b) patch.title = (b.title ?? '').toString();
		if ('content' in b) patch.content = (b.content ?? '').toString();
		if ('category' in b && MEMORY_CATEGORIES.includes(b.category as MemoryCategory)) patch.category = b.category as MemoryCategory;
		return json({ company: updateMemory((b.id ?? '').toString(), patch) });
	}
	if (action === 'remove-memory') return json({ company: removeMemory((b.id ?? '').toString()) });
	if (action === 'add-role') return json({ company: addRole((b.title ?? '').toString(), (b.description ?? '').toString()) });
	if (action === 'remove-role') return json({ company: removeRole((b.id ?? '').toString()) });
	if (action === 'add-agent') return json({ company: addAgent((b.name ?? '').toString(), (b.role ?? '').toString(), (b.personaId ?? '').toString()) });
	if (action === 'remove-agent') return json({ company: removeAgent((b.id ?? '').toString()) });
	if (action === 'set-agent-model') return json({ company: setAgentModel((b.agentId ?? '').toString(), b.model ?? null) });
	if (action === 'set-agent-tools') return json({ company: setAgentTools((b.agentId ?? '').toString(), Array.isArray(b.tools) ? b.tools.map(String) : []) });
	if (action === 'set-agent-autonomy') return json({ company: setAgentAutonomy((b.agentId ?? '').toString(), clampAutonomy(b.level)) });
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

	// ---------- Tasks (Aufgaben) ----------
	if (action === 'add-task') {
		const title = (b.title ?? '').toString().trim();
		if (!title) return json({ company: getCompany() });
		addTask({
			title,
			description: (b.description ?? '').toString(),
			agentId: b.agentId ? b.agentId.toString() : undefined,
			goalId: b.goalId ? b.goalId.toString() : undefined,
			status: b.status as TaskStatus
		});
		feed({ type: 'system', title: 'Neue Aufgabe: ' + shorten(title, 80) });
		return json({ company: getCompany() });
	}
	if (action === 'update-task') {
		const patch: Record<string, unknown> = {};
		if ('title' in b) patch.title = (b.title ?? '').toString();
		if ('description' in b) patch.description = (b.description ?? '').toString();
		if ('status' in b) patch.status = b.status as TaskStatus;
		if ('result' in b) patch.result = (b.result ?? '').toString();
		if ('agentId' in b) patch.agentId = b.agentId ? b.agentId.toString() : '';
		if ('goalId' in b) patch.goalId = b.goalId ? b.goalId.toString() : '';
		return json({ company: updateTask((b.id ?? '').toString(), patch) });
	}
	if (action === 'remove-task') return json({ company: removeTask((b.id ?? '').toString()) });
	if (action === 'set-task-status') {
		setTaskStatus((b.id ?? '').toString(), b.status as TaskStatus);
		return json({ company: getCompany() });
	}

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
