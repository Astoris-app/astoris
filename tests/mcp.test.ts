import { afterEach, describe, expect, it, vi } from 'vitest';
import { createServer, type Server as HttpServer } from 'node:http';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';

const mocks = vi.hoisted(() => ({ connection: vi.fn() }));
vi.mock('../src/lib/server/store', () => ({ getDecrypted: mocks.connection }));
import { buildMcpTools, runMcpTool, validateMcpEndpoint } from '../src/lib/server/mcp';
let httpServer: HttpServer | undefined;
afterEach(async () => {
	if (httpServer) {
		const server = httpServer; httpServer = undefined;
		await new Promise<void>((resolve) => { server.close(() => resolve()); server.closeAllConnections(); });
	}
	vi.clearAllMocks();
});

describe('MCP with an actual Streamable HTTP server', () => {
	it('discovers only explicitly allowed tools, calls them, and refuses revoked credentials', async () => {
		let effects = 0;
		httpServer = createServer(async (request, response) => {
			if (request.method !== 'POST') { response.writeHead(405).end(); return; }
			const server = new Server({ name: 'test-only-server', version: '1.0.0' }, { capabilities: { tools: {} } });
			server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [
				{ name: 'allowed', inputSchema: { type: 'object' as const } }, { name: 'not_allowed', inputSchema: { type: 'object' as const } }
			] }));
			server.setRequestHandler(CallToolRequestSchema, async (req) => {
				effects++; return { content: [{ type: 'text', text: JSON.stringify(req.params.arguments) }] };
			});
			const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
			response.on('close', () => { void transport.close(); void server.close(); });
			await server.connect(transport); await transport.handleRequest(request, response);
		});
		await new Promise<void>((resolve) => httpServer!.listen(0, '127.0.0.1', resolve));
		const address = httpServer.address(); if (!address || typeof address === 'string') throw new Error();
		mocks.connection.mockReturnValue({ scopes: { tools: true }, plain: { url: `http://127.0.0.1:${address.port}/mcp`, tool_names: 'allowed' } });
		const catalog = await buildMcpTools(); expect(catalog.tools).toHaveLength(1); expect(effects).toBe(0);
		const tool = [...catalog.byName.values()][0]; expect(tool.remoteName).toBe('allowed');
		expect(await runMcpTool(tool, { query: 'example' })).toMatchObject({ content: [{ type: 'text', text: '{"query":"example"}' }] });
		expect(effects).toBe(1);
		mocks.connection.mockReturnValue({ scopes: { tools: false }, plain: {} });
		expect(await runMcpTool(tool, {})).toHaveProperty('error'); expect((await buildMcpTools()).tools).toEqual([]);
		expect(effects).toBe(1);
	});
	it('does not expose tools when the connection or explicit names are missing', async () => {
		mocks.connection.mockReturnValue(null); expect((await buildMcpTools()).tools).toEqual([]);
		mocks.connection.mockReturnValue({ scopes: { tools: true }, plain: { url: 'https://example.org/mcp' } });
		expect((await buildMcpTools()).tools).toEqual([]);
	});
	it.each(['file:///etc/passwd', 'https://user:password@example.org/mcp', 'http://169.254.169.254/mcp', 'http://metadata.google.internal/mcp'])('rejects invalid or metadata endpoint %s', async (url) => {
		await expect(validateMcpEndpoint(url)).rejects.toThrow();
	});
});
