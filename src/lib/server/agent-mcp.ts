import { error, json } from '@sveltejs/kit';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import type { AgentScope } from '$lib/setup-plan';
import { companyContext, documentVersions, operator } from './runtime/context';
import { listCompanies } from './companies';
import { setupContext, setupStore, proposeSetup } from './ai-setup';
import { runtimeStore } from './runtime';
import { engineChat } from './engine';
import { sameOrigin } from './setup-http';
import { getUsername, isTailscaleAllowed } from './auth';
import type { AgentAccess } from './setup-store';

function ownerAllowed(access: AgentAccess) {
	return access.method === 'password' ? access.owner === getUsername() : access.method === 'tailscale' && isTailscaleAllowed(access.owner);
}

const record = { type: 'object', additionalProperties: false, properties: {} };
const planSchema = { type: 'object', additionalProperties: false,
	required: ['summary', 'profile', 'roles', 'goals', 'connectors'], properties: {
		summary: { type: 'string', maxLength: 1500 },
		profile: { type: 'object', additionalProperties: false, required: ['name', 'industry', 'mission'], properties: {
			name: { type: 'string', maxLength: 120 }, industry: { type: 'string', maxLength: 120 }, mission: { type: 'string', maxLength: 2000 } } },
		roles: { type: 'array', maxItems: 8, items: { type: 'object', required: ['title', 'description'], additionalProperties: false,
			properties: { title: { type: 'string', maxLength: 140 }, description: { type: 'string', maxLength: 700 } } } },
		goals: { type: 'array', maxItems: 6, items: { type: 'object', required: ['title', 'description'], additionalProperties: false,
			properties: { title: { type: 'string', maxLength: 140 }, description: { type: 'string', maxLength: 700 } } } },
		connectors: { type: 'array', maxItems: 8, items: { type: 'string' } }
	} };
const tools: { name: string; scope: AgentScope; description: string; inputSchema: Record<string, unknown>; readOnly: boolean }[] = [
	{ name: 'astoris_setup_context', scope: 'setup:read', readOnly: true, inputSchema: record,
		description: 'Read the token-bound company profile, roles, goals, available connectors and baseVersion. No credentials. Read this before proposing setup.' },
	{ name: 'astoris_propose_setup', scope: 'setup:propose', readOnly: false,
		description: 'Save a validated setup proposal for human review. Does NOT apply it. Human approval is only available in the Astoris UI. Never put secrets or code in a plan.',
		inputSchema: { type: 'object', additionalProperties: false, required: ['baseVersion', 'plan'], properties: {
			baseVersion: { type: 'integer', minimum: 1 }, plan: planSchema } } },
	{ name: 'astoris_list_runs', scope: 'runs:read', readOnly: true, inputSchema: record,
		description: 'List the last 50 runs belonging to this access owner and company.' },
	{ name: 'astoris_get_run', scope: 'runs:read', readOnly: true,
		description: 'Read an authorized run, its tool calls and audit events.',
		inputSchema: { type: 'object', additionalProperties: false, required: ['id'], properties: { id: { type: 'string', maxLength: 80 } } } },
	{ name: 'astoris_send_message', scope: 'runs:create', readOnly: false,
		description: 'Ask the configured Astoris AI to perform a task with autonomy 1. Write/external tools need human approval. This tool cannot approve, send drafts, install add-ons or change connections.',
		inputSchema: { type: 'object', additionalProperties: false, required: ['message'], properties: { message: { type: 'string', minLength: 1, maxLength: 6000 } } } }
];

export async function handleAgentMcp(request: Request, url: URL): Promise<Response> {
	sameOrigin(request, url);
	const credential = request.headers.get('authorization')?.match(/^Bearer (\S+)$/i)?.[1] ?? '';
	let access;
	try { access = setupStore().authenticate(credential); }
	catch { return json({ error: 'Invalid or expired agent access.' }, { status: 401,
		headers: { 'www-authenticate': 'Bearer realm="Astoris agent"', 'cache-control': 'no-store' } }); }
	if (!ownerAllowed(access)) error(401, 'Access owner is no longer authorized.');
	if (!listCompanies().some((c) => c.id === access.companyId)) error(403, 'Company unavailable.');
	setupStore().limit('mcp:' + access.id, 60);
	const granted = access;
	return operator.run(granted.owner, () => companyContext.run(granted.companyId, () => documentVersions.run(new Map(), async () => {
		const server = new Server({ name: 'astoris', version: '1.0.0' }, { capabilities: { tools: {} },
			instructions: 'Only operate within the token-bound company. Read context before proposing. Setup changes require human approval at /einrichten. Never ask for credentials or claim that a proposal was applied.' });
		server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: tools.filter((t) => granted.scopes.includes(t.scope)).map((t) => ({
			name: t.name, description: t.description, inputSchema: t.inputSchema as { type: 'object' },
			annotations: { readOnlyHint: t.readOnly, destructiveHint: false, openWorldHint: t.name === 'astoris_send_message' }
		})) }));
		server.setRequestHandler(CallToolRequestSchema, async (call) => {
			const tool = tools.find((t) => t.name === call.params.name);
			if (!tool || !granted.scopes.includes(tool.scope)) return { isError: true, content: [{ type: 'text', text: 'Tool not permitted.' }] };
			// Recheck expiry/revocation for every tool, not just initialization.
			setupStore().authenticate(credential);
			if (!ownerAllowed(granted)) error(401);
			const args = call.params.arguments ?? {};
			setupStore().recordAccess(granted, 'mcp.' + tool.name);
			let result: unknown;
			try {
				if (tool.name === 'astoris_setup_context') result = setupContext();
				else if (tool.name === 'astoris_propose_setup') {
					setupStore().limit('proposal:' + granted.id, 10);
					result = { draft: proposeSetup(granted.owner, args.baseVersion as number, args.plan), approvalUrl: new URL('/einrichten', url).href };
				} else if (tool.name === 'astoris_list_runs') result = runtimeStore().list(granted.companyId, granted.owner);
				else if (tool.name === 'astoris_get_run') {
					const run = typeof args.id === 'string' && runtimeStore().get(args.id);
					if (!run || run.owner !== granted.owner || run.companyId !== granted.companyId) error(404);
					result = { run, calls: runtimeStore().calls(run.id), events: runtimeStore().events(run.id) };
				} else {
					if (typeof args.message !== 'string' || !args.message.trim() || args.message.length > 6000) error(400);
					setupStore().limit('run:' + granted.id);
					result = await engineChat([{ role: 'user', content: args.message }], null, undefined, { autonomy: 1 });
				}
			} catch (cause) {
				const status = typeof cause === 'object' && cause && 'status' in cause ? cause.status : 500;
				return { isError: true, content: [{ type: 'text', text: `Astoris rejected the operation (${status}). Check input, company revision and access scope.` }] };
			}
			return { content: [{ type: 'text', text: JSON.stringify(result) }] };
		});
		const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true, maxRequestBodySize: 32768 });
		try {
			await server.connect(transport);
			const response = await transport.handleRequest(request);
			response.headers.set('cache-control', 'no-store');
			return response;
		} finally { await server.close(); }
	})));
}
