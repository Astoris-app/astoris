import type { Run, ToolCall } from '../src/lib/server/runtime/store';

export type RunDetail = { run: Run; calls: ToolCall[]; events: { seq: number; at: string; action: string; actor: string; targetId?: string }[] };
export type ChatResponse = { reply: string; source: 'model' | 'engine' | 'demo'; runId: string; pendingTools?: { id: string; name: string; reason: string }[] };

/** Fetch-based client for the authenticated Astoris API. Mutations are never retried. */
export class AstorisClient {
	private sessionCookie?: string;
	private base: string;
	private options: { fetch?: typeof fetch; timeoutMs?: number };
	constructor(baseUrl: string, options: { fetch?: typeof fetch; timeoutMs?: number } = {}) {
		this.options = options;
		const url = new URL(baseUrl);
		if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('Invalid Astoris URL.');
		this.base = url.href.replace(/\/$/, '');
	}
	private async request<T>(path: string, body?: unknown): Promise<T> {
		const response = await (this.options.fetch ?? fetch)(this.base + path, {
			method: body === undefined ? 'GET' : 'POST', credentials: 'include', redirect: 'error',
			headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...(this.sessionCookie ? { cookie: this.sessionCookie } : {}) },
			body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(this.options.timeoutMs ?? 600000)
		});
		const setCookie = response.headers.get('set-cookie');
		if (setCookie) this.sessionCookie = setCookie.split(';')[0];
		const data = await response.json();
		if (!response.ok) throw new Error(`Astoris API ${response.status}: ${data.message ?? data.error ?? 'Request failed'}`);
		return data as T;
	}
	async login(username: string, password: string): Promise<void> { await this.request('/api/auth', { action: 'login', username, password }); }
	async logout(): Promise<void> { await this.request('/api/auth', { action: 'logout' }); this.sessionCookie = undefined; }
	async listRuns(): Promise<Run[]> { return (await this.request<{ runs: Run[] }>('/api/runs')).runs; }
	getRun(id: string) { return this.request<RunDetail>(`/api/runs/${encodeURIComponent(id)}`); }
	send(message: string) { return this.request<ChatResponse>('/api/runs', { message }); }
	approve(runId: string, callId: string) { return this.request<{ run: Run; call: ToolCall }>(`/api/runs/${encodeURIComponent(runId)}`, { action: 'approve', callId }); }
	reject(runId: string, callId: string) { return this.request<{ run: Run; call: ToolCall }>(`/api/runs/${encodeURIComponent(runId)}`, { action: 'reject', callId }); }
	cancel(runId: string) { return this.request<{ run: Run }>(`/api/runs/${encodeURIComponent(runId)}`, { action: 'cancel' }); }
}
