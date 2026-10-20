import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { setTimeout as delay } from 'node:timers/promises';

const root = fileURLToPath(new URL('..', import.meta.url));
assert(existsSync(join(root, 'build/index.js')), 'Run pnpm build before the smoke test.');
const fixture = mkdtempSync(join(tmpdir(), 'astoris-production-smoke-'));
mkdirSync(join(fixture, 'data'), { mode: 0o700 });
writeFileSync(join(fixture, 'data/calendar.json'), JSON.stringify([{ id: 'legacy-event', title: 'Legacy appointment', date: '2026-10-20' }]));

async function listen(server: Server): Promise<number> {
	await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
	const address = server.address(); assert(address && typeof address !== 'string'); return address.port;
}
const probe = createServer(); const port = await listen(probe); await new Promise<void>((done) => probe.close(() => done()));
const base = `http://127.0.0.1:${port}`;
let child: ChildProcess | undefined;
let exited: Promise<unknown> | undefined;
let cookie = '';
let logs = '';
const model = createServer(async (request, response) => {
	response.setHeader('content-type', 'application/json');
	if (request.url === '/v1/models') { response.end(JSON.stringify({ data: [{ id: 'smoke-model' }] })); return; }
	let raw = '';
	for await (const chunk of request) raw += chunk.toString();
	const body = JSON.parse(raw || '{}');
	if (body.messages?.some((m: { content?: string }) => m.content?.includes('You prepare a configuration proposal'))) {
		assert.equal(body.tools, undefined, 'Setup planning must not offer execution tools.');
		response.setHeader('content-type', 'text/event-stream');
		const content = JSON.stringify({ kind: 'plan', plan: { summary: 'Consulting workspace',
			profile: { name: 'Alpha AI', industry: 'Consulting', mission: 'Help small businesses' },
			roles: [{ title: 'Support', description: 'Customer onboarding' }],
			goals: [{ title: 'First consulting client', description: 'Complete one onboarding' }], connectors: ['email'] } });
		response.end(`data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\ndata: [DONE]\n\n`); return;
	}
	response.end(JSON.stringify({ choices: [{ message: { role: 'assistant', tool_calls: [{ id: 'smoke-tool', type: 'function',
		function: { name: 'calendar_create', arguments: JSON.stringify({ title: 'Approved appointment', date: '2026-10-21' }) } }] } }] }));
});

async function start() {
	child = spawn(process.execPath, [resolve(root, 'build/index.js')], { cwd: fixture,
		env: { NODE_ENV: 'production', HOST: '127.0.0.1', PORT: String(port), ORIGIN: base, ASTORIS_MASTER_KEY: 'c'.repeat(64) }, stdio: ['ignore', 'pipe', 'pipe'] });
	exited = once(child, 'exit');
	child.stdout?.on('data', (chunk) => { logs += chunk.toString(); });
	child.stderr?.on('data', (chunk) => { logs += chunk.toString(); });
	for (let attempt = 0; attempt < 100; attempt++) {
		if (child.exitCode !== null) throw new Error(logs);
		try { if ((await fetch(base + '/api/setup')).ok) return; } catch { /* still booting */ }
		await delay(50);
	}
	throw new Error('Production server did not start: ' + logs);
}
async function stop() {
	if (child && child.exitCode === null && child.signalCode === null) { child.kill('SIGTERM'); await exited; }
	child = undefined;
}
async function api(path: string, body?: unknown, expected = 200) {
	const response = await fetch(base + path, { method: body === undefined ? 'GET' : 'POST',
		headers: { 'content-type': 'application/json', cookie, origin: base }, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual' });
	const raw = await response.text();
	assert.equal(response.status, expected, path + ': ' + raw.slice(0, 500));
	if (response.headers.has('set-cookie')) cookie = response.headers.get('set-cookie')!.split(';')[0];
	return raw ? JSON.parse(raw) : null;
}

try {
	const modelPort = await listen(model);
	await start();
	await api('/api/runs', undefined, 401);
	await api('/api/auth', { action: 'set-password', username: 'smoke-operator', password: randomUUID() });
	await api('/api/setup', { profile: 'company' });
	assert.equal((await api('/api/calendar')).events.length, 1);
	assert.equal((await api('/api/connections', { connectorId: 'local-models', fields: { base_url: `http://127.0.0.1:${modelPort}` }, scopes: { use: true } })).saved, true);

	const alpha = await api('/api/companies', { action: 'create', name: 'Alpha', goals: ['Alpha goal'] });
	assert.equal((await api('/api/company')).company.name, 'Alpha');
	await api('/api/crm', { action: 'add-contact', name: 'Alpha contact' });
	await api('/api/companies', { action: 'create', name: 'Beta' });
	assert.equal((await api('/api/company')).company.name, 'Beta');
	assert.equal((await api('/api/crm')).crm.contacts.length, 0);
	await api('/api/companies', { action: 'switch', id: alpha.id });
	assert.equal((await api('/api/company')).company.goals[0].title, 'Alpha goal');
	assert.equal((await api('/api/crm')).crm.contacts[0].name, 'Alpha contact');

	const run = await api('/api/runs', { message: 'Create an appointment' });
	assert.equal((await api(`/api/runs/${run.runId}`)).run.status, 'waiting_for_approval');
	assert.equal((await api('/api/calendar')).events.length, 1);
	await stop();
	// This change must not overwrite data already imported into SQLite.
	writeFileSync(join(fixture, 'data/calendar.json'), '[]');
	await start();
	assert.equal((await api(`/api/runs/${run.runId}`)).calls[0].status, 'pending');
	assert.equal((await api('/api/calendar')).events.length, 1);
	await api(`/api/runs/${run.runId}`, { action: 'approve', callId: run.pendingTools[0].id });
	assert.equal((await api('/api/calendar')).events.length, 2);
	await api(`/api/runs/${run.runId}`, { action: 'approve', callId: run.pendingTools[0].id }, 409);
	assert.equal((await api('/api/calendar')).events.length, 2);
	const detail = await api(`/api/runs/${run.runId}`);
	assert.equal(detail.run.status, 'completed'); assert(detail.events.some((event: { action: string }) => event.action === 'tool.completed'));
	const html = await fetch(base + '/entscheidungen', { headers: { cookie } });
	assert.equal(html.status, 200); assert.match(await html.text(), /Agentenläufe/);
	assert.equal((await api('/api/plugins', { action: 'run', code: 'async function run(input) { return input.n * 2; }', input: { n: 21 } })).output, 42);
	const setup = await api('/api/ai-setup');
	const proposal = await api('/api/ai-setup', { action: 'propose', brief: 'Build a small consulting company', lang: 'en' });
	assert.equal(proposal.kind, 'plan'); assert.equal(proposal.draft.status, 'draft');
	assert.equal((await api('/api/company')).company.name, 'Alpha');
	const issued = await api('/api/agent-access', { action: 'create', name: 'Smoke planner', days: 1,
		scopes: ['setup:read', 'setup:propose', 'runs:read'] });
	const authHeaders = { authorization: 'Bearer ' + issued.credential };
	assert.equal((await fetch(base + '/api/agent-access', { headers: { ...authHeaders, cookie } })).status, 401);
	const client = new Client({ name: 'smoke-external-agent', version: '1.0.0' });
	try {
		await client.connect(new StreamableHTTPClientTransport(new URL(base + '/api/agent/mcp'), { requestInit: { headers: authHeaders } }));
		const tools = await client.listTools();
		assert(!tools.tools.some((t) => /approve|reject|token|access/i.test(t.name)));
		const beta = (await api('/api/companies')).companies.find((c: { name: string }) => c.name === 'Beta');
		await api('/api/companies', { action: 'switch', id: beta.id });
		const remote = await client.callTool({ name: 'astoris_setup_context', arguments: {} });
		assert.equal(JSON.parse((remote.content as { text: string }[])[0].text).companyId, alpha.id);
		await api('/api/ai-setup', { action: 'approve', id: proposal.draft.id }, 404);
		await api('/api/companies', { action: 'switch', id: alpha.id });
		const external = await client.callTool({ name: 'astoris_propose_setup', arguments: {
			baseVersion: setup.context.baseVersion, plan: proposal.draft.plan
		} });
		assert(!external.isError); const externalId = JSON.parse((external.content as { text: string }[])[0].text).draft.id;
		await stop(); await start();
		assert((await api('/api/ai-setup')).plans.some((p: { id: string; status: string }) => p.id === proposal.draft.id && p.status === 'draft'));
		await client.listTools(); // hashed credentials survive restart
		await api('/api/ai-setup', { action: 'approve', id: proposal.draft.id });
		await api('/api/ai-setup', { action: 'approve', id: proposal.draft.id }); // safe retry, no duplicate agents/goals
		await api('/api/ai-setup', { action: 'approve', id: externalId }, 409); // stale proposal
		const configured = (await api('/api/company')).company;
		assert.equal(configured.name, 'Alpha AI'); assert.equal(configured.agents.length, 1); assert.equal(configured.goals.length, 2);
		assert.deepEqual(configured.agents[0].tools, []); assert.equal(configured.agents[0].autonomyLevel, 1);
		await api('/api/agent-access', { action: 'revoke', id: issued.access.id });
		await assert.rejects(() => client.listTools());
		assert(!(await api('/api/agent-access')).accesses.some((a: Record<string, unknown>) => 'credential' in a));
	} finally { await client.close(); }
	const setupHtml = await fetch(base + '/einrichten', { headers: { cookie } });
	assert.equal(setupHtml.status, 200); assert.match(await setupHtml.text(), /Mit KI einrichten/);
	console.log('Production smoke passed: login, migration, scopes, model tools, restart, approval once, audit, SSR, isolated add-on; AI setup, human approval, scoped MCP, token persistence/revocation.');
} finally {
	await stop();
	await new Promise<void>((done) => { model.close(() => done()); model.closeAllConnections(); });
	rmSync(fixture, { recursive: true, force: true });
}
