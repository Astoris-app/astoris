import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RuntimeStore } from '../src/lib/server/runtime/store';
import { encrypt, decrypt } from '../src/lib/server/crypto';

const mocks = vi.hoisted(() => ({ getConnection: vi.fn(), createEvent: vi.fn(), getPlugin: vi.fn(), listPlugins: vi.fn(), getConfig: vi.fn(), model: vi.fn() }));
let store: RuntimeStore;
vi.mock('../src/lib/server/runtime', () => ({ runtimeStore: () => store }));
vi.mock('../src/lib/server/store', () => ({ getDecrypted: mocks.getConnection }));
vi.mock('../src/lib/server/calendar', () => ({ listEvents: () => [], createEvent: mocks.createEvent, updateEvent: vi.fn(), deleteEvent: vi.fn() }));
vi.mock('../src/lib/server/plugins', () => ({ listPlugins: mocks.listPlugins, getPlugin: mocks.getPlugin }));
vi.mock('../src/lib/server/pluginConfig', () => ({ getPluginConfig: mocks.getConfig }));
vi.mock('../src/lib/server/companies', () => ({ getActiveId: () => 'company-a' }));
vi.mock('../src/lib/server/models', () => ({ getSelectedModel: mocks.model }));
vi.mock('../src/lib/server/kiSource', () => ({ getKiSource: () => 'local' }));
vi.mock('../src/lib/server/aigate', () => ({ getAigateMode: () => 'off', applyAigate: (messages: unknown) => ({ messages, blocked: false }) }));

import { engineChat } from '../src/lib/server/engine';
import { resolveToolCall } from '../src/lib/server/tools';
import { operator } from '../src/lib/server/runtime/context';

function reply(message: unknown) { return Response.json({ choices: [{ message }] }); }
function tool(name: string, args: unknown = {}) { return { id: 'call-1', type: 'function', function: { name, arguments: JSON.stringify(args) } }; }
function chat(tools?: string[], autonomy = 3) { return operator.run('alice', () => engineChat([{ role: 'user', content: 'Do work' }], null, tools, { autonomy })); }

beforeEach(() => {
	store = new RuntimeStore(':memory:', { encrypt, decrypt });
	mocks.getConnection.mockImplementation((id: string) => id === 'local-models' ? { plain: { base_url: 'http://model.test' } } : null);
	mocks.listPlugins.mockReturnValue([]); mocks.getConfig.mockReturnValue({}); mocks.model.mockReturnValue(null);
	mocks.createEvent.mockReturnValue({ id: 'event-1' });
});
afterEach(() => { store.close(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe('real model-to-tool integration', () => {
	it('does not execute a hallucinated tool outside the offered allowlist', async () => {
		const fetchMock = vi.fn().mockResolvedValueOnce(Response.json({ data: [{ id: 'test-model' }] }))
			.mockResolvedValueOnce(reply({ tool_calls: [tool('calendar_create', { title: 'test', date: '2026-10-20' })] }))
			.mockResolvedValueOnce(reply({ content: 'Done' }));
		vi.stubGlobal('fetch', fetchMock);
		await chat(['calendar_list'], 5);
		expect(mocks.createEvent).not.toHaveBeenCalled();
		expect(store.list('company-a', 'alice')[0].status).toBe('completed');
		expect(store.events(store.list('company-a', 'alice')[0].id).some((event) => event.action === 'tool.denied')).toBe(true);
	});
	it('treats an empty allowlist as no tools, not all tools', async () => {
		vi.stubGlobal('fetch', vi.fn().mockImplementation(async (_url, options) => {
			if (!options?.body) return Response.json({ data: [{ id: 'test-model' }] });
			expect(JSON.parse(options.body).tools).toBeUndefined();
			return new Response('data: {"choices":[{"delta":{"content":"Read-only answer"}}]}\n\ndata: [DONE]\n\n');
		}));
		const result = await chat([]);
		expect(result.reply).toBe('Read-only answer'); expect(mocks.createEvent).not.toHaveBeenCalled();
	});
	it('persists the exact calendar proposal and executes once after approval', async () => {
		vi.stubGlobal('fetch', vi.fn().mockImplementation(async (_url, options) => {
			if (!options?.body) return Response.json({ data: [{ id: 'test-model' }] });
			return reply({ tool_calls: [tool('calendar_create', { title: 'Review', date: '2026-10-20' })] });
		}));
		const result = await chat();
		expect(mocks.createEvent).not.toHaveBeenCalled();
		expect(store.get(result.runId!)?.status).toBe('waiting_for_approval');
		const id = result.pendingTools![0].id;
		await resolveToolCall(id, true, 'alice');
		expect(mocks.createEvent).toHaveBeenCalledExactlyOnceWith('Review', '2026-10-20', undefined, undefined);
		await expect(resolveToolCall(id, true, 'alice')).rejects.toThrow();
		expect(store.get(result.runId!)?.status).toBe('completed');
	});
	it('does not repeat actions or fall back after a model failure following execution', async () => {
		let calls = 0;
		vi.stubGlobal('fetch', vi.fn().mockImplementation(async (_url, options) => {
			if (!options?.body) return Response.json({ data: [{ id: 'test-model' }] });
			calls++;
			if (calls === 1) return reply({ tool_calls: [tool('calendar_create', { title: 'Review', date: '2026-10-20' })] });
			throw new Error('model disconnected');
		}));
		await expect(chat(undefined, 4)).rejects.toThrow('model disconnected');
		expect(calls).toBe(2); expect(mocks.createEvent).toHaveBeenCalledTimes(1);
		expect(store.list('company-a', 'alice')[0].status).toBe('failed');
	});
	it('preserves every pending action when a model requests multiple tools in one response', async () => {
		vi.stubGlobal('fetch', vi.fn().mockImplementation(async (_url, options) => {
			if (!options?.body) return Response.json({ data: [{ id: 'test-model' }] });
			return reply({ tool_calls: [tool('calendar_create', { title: 'One', date: '2026-10-20' }),
				{ ...tool('calendar_create', { title: 'Two', date: '2026-10-21' }), id: 'call-2' }] });
		}));
		const result = await chat(); expect(result.pendingTools).toHaveLength(2); expect(mocks.createEvent).not.toHaveBeenCalled();
		await resolveToolCall(result.pendingTools![0].id, true, 'alice');
		expect(store.get(result.runId!)?.status).toBe('waiting_for_approval');
		await resolveToolCall(result.pendingTools![1].id, true, 'alice');
		expect(store.get(result.runId!)?.status).toBe('completed'); expect(mocks.createEvent).toHaveBeenCalledTimes(2);
	});
	it('preserves draft-only mail behavior', async () => {
		let calls = 0;
		vi.stubGlobal('fetch', vi.fn().mockImplementation(async (_url, options) => {
			if (!options?.body) return Response.json({ data: [{ id: 'test-model' }] });
			return ++calls === 1 ? reply({ tool_calls: [tool('mail_send', { to: 'person@example.org', text: 'Draft' })] }) : reply({ content: 'Draft ready' });
		}));
		const result = await chat(['mail_send'], 1);
		expect(result.pendingMail).toEqual({ to: 'person@example.org', text: 'Draft', subject: '' });
		expect(store.calls(result.runId!)[0].risk).toBe('draft');
	});
	it('requires a new proposal if add-on code or credentials change after preview', async () => {
		const addon = { id: 'example-tool', type: 'agent-tool', name: 'Example', enabled: true, code: 'async function run(){ return 1; }' };
		mocks.listPlugins.mockReturnValue([addon]); mocks.getPlugin.mockReturnValue(addon);
		vi.stubGlobal('fetch', vi.fn().mockImplementation(async (_url, options) => {
			if (!options?.body) return Response.json({ data: [{ id: 'test-model' }] });
			return reply({ tool_calls: [tool('example_tool')] });
		}));
		const result = await chat();
		mocks.getConfig.mockReturnValue({ api_key: 'changed-secret' });
		await resolveToolCall(result.pendingTools![0].id, true, 'alice');
		expect(store.get(result.runId!)?.status).toBe('failed');
		expect(store.call(result.pendingTools![0].id)?.error).toContain('verändert');
	});
	it('applies the same approval boundary to Anthropic', async () => {
		mocks.getConnection.mockImplementation((id: string) => id === 'cloud-ai' ? { plain: { provider: 'anthropic', api_key: 'test-only' } } : null);
		mocks.model.mockReturnValue({ source: 'cloud', model: 'test-model' });
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ content: [{ type: 'tool_use', id: '1', name: 'calendar_create', input: { title: 'Review', date: '2026-10-20' } }] })));
		const result = await chat();
		expect(mocks.createEvent).not.toHaveBeenCalled(); expect(result.pendingTools).toHaveLength(1);
	});
});
