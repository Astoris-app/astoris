import { AsyncLocalStorage } from 'node:async_hooks';

export type ExecutionContext = { runId: string; owner: string; companyId: string; autonomy: number; effectsStarted: boolean };
export const execution = new AsyncLocalStorage<ExecutionContext>();
export const operator = new AsyncLocalStorage<string>();
export const companyContext = new AsyncLocalStorage<string>();
export const documentVersions = new AsyncLocalStorage<Map<string, number>>();
