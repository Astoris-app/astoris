import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createHash } from 'node:crypto';
import dns from 'node:dns/promises';
import { getDecrypted } from './store';
import type { AddonTool } from './tools';

type McpFields = { url: string; token?: string; tool_names?: string };
export type McpTool = { name: string; remoteName: string; schema: unknown; description: string; connectionHash: string };
const hash = (input: unknown) => createHash('sha256').update(JSON.stringify(input)).digest('hex');

export async function validateMcpEndpoint(raw: string): Promise<URL> {
	const url = new URL(raw);
	if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash) throw new Error('Ungültige MCP-URL.');
	const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
	if (host === 'metadata.google.internal') throw new Error('Metadata-Endpunkt nicht erlaubt.');
	const addresses = await dns.lookup(host, { all: true });
	for (const { address } of addresses) {
		const ip = address.toLowerCase().replace(/^::ffff:/, '');
		if (/^(169\.254\.|0\.|fe80:|ff)/.test(ip) || ip === 'fd00:ec2::254' || /^22[4-9]\.|^23\d\./.test(ip)) throw new Error('Metadata-/Link-Local-Endpunkt nicht erlaubt.');
	}
	// Local endpoints are explicitly configured by the operator, never supplied by the model.
	if (url.protocol !== 'https:' && !['localhost', '127.0.0.1', '::1'].includes(host)) throw new Error('Für entfernte MCP-Server ist HTTPS erforderlich.');
	return url;
}

async function withClient<T>(fields: McpFields, work: (client: Client) => Promise<T>): Promise<T> {
	const endpoint = await validateMcpEndpoint(fields.url);
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), 15000);
	const client = new Client({ name: 'astoris', version: '0.1.0' });
	const transport = new StreamableHTTPClientTransport(endpoint, {
		requestInit: { headers: fields.token ? { authorization: `Bearer ${fields.token}` } : {} },
		fetch: async (input, init) => {
			const requested = new URL(typeof input === 'string' ? input : input.href);
			if (requested.origin !== endpoint.origin) throw new Error('MCP-Weiterleitung blockiert.');
			await validateMcpEndpoint(requested.href);
			return fetch(input, { ...init, redirect: 'error', signal: init?.signal ? AbortSignal.any([controller.signal, init.signal]) : controller.signal });
		}
	});
	try { await client.connect(transport); return await work(client); }
	finally { clearTimeout(timer); controller.abort(); await client.close().catch(() => {}); }
}

export async function testMcpConnection(fields: McpFields) {
	return withClient(fields, async (client) => (await client.listTools()).tools.length);
}

let cached: { key: string; until: number; tools: McpTool[] } | undefined;
export async function buildMcpTools(refresh = false): Promise<{ tools: AddonTool[]; byName: Map<string, McpTool> }> {
	const connection = getDecrypted('mcp-server');
	if (!connection?.scopes?.tools || !connection.plain.url) return { tools: [], byName: new Map() };
	const fields = connection.plain as McpFields;
	const allowed = new Set((fields.tool_names ?? '').split(',').map((s) => s.trim()).filter(Boolean));
	if (!allowed.size) return { tools: [], byName: new Map() };
	const key = hash(fields);
	if (refresh || !cached || cached.key !== key || cached.until < Date.now()) {
		const tools = await withClient(fields, async (client) => {
			const result: McpTool[] = [];
			let cursor: string | undefined;
			for (let page = 0; page < 10; page++) {
				const response = await client.listTools(cursor ? { cursor } : undefined);
				for (const tool of response.tools) {
					if (!allowed.has(tool.name)) continue;
					result.push({ name: `mcp_${tool.name.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 40)}_${hash(tool.name).slice(0, 8)}`,
						remoteName: tool.name, schema: tool.inputSchema, description: (tool.description ?? tool.name).slice(0, 2000), connectionHash: key });
				}
				cursor = response.nextCursor;
				if (!cursor) break;
			}
			return result.slice(0, 50);
		});
		cached = { key, until: Date.now() + 30000, tools };
	}
	return { tools: cached.tools.map((tool) => ({ type: 'function', function: { name: tool.name, description: tool.description, parameters: tool.schema } })),
		byName: new Map(cached.tools.map((t) => [t.name, t])) };
}

export async function runMcpTool(tool: McpTool, args: unknown) {
	const connection = getDecrypted('mcp-server');
	if (!connection?.scopes?.tools || hash(connection.plain) !== tool.connectionHash) return { error: 'MCP-Verbindung wurde verändert oder gesperrt.' };
	return withClient(connection.plain as McpFields, async (client) => {
		const result = await client.callTool({ name: tool.remoteName, arguments: args as Record<string, unknown> });
		return result.isError ? { error: 'MCP-Werkzeug meldet einen Fehler.', content: result.content } : result;
	});
}
