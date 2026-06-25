// Persistente Chat-Verläufe. Ein Datensatz pro Gespräch in data/chats.json.
// Single-User (global); bei Multi-Tenancy später pro Workspace trennen.

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const FILE = 'data/chats.json';

export type StoredMsg = {
	role: 'user' | 'assistant';
	text: string;
	reasoning?: string;
	model?: string;
	ms?: number;
	time?: string;
	demo?: boolean;
};
export type Chat = {
	id: string;
	title: string;
	messages: StoredMsg[];
	createdAt: string;
	updatedAt: string;
};
export type ChatSummary = { id: string; title: string; updatedAt: string; count: number };

function load(): Chat[] {
	if (!existsSync(FILE)) return [];
	try { return JSON.parse(readFileSync(FILE, 'utf8')) as Chat[]; } catch { return []; }
}
function save(list: Chat[]) {
	mkdirSync('data', { recursive: true });
	writeFileSync(FILE, JSON.stringify(list, null, 2), { mode: 0o600 });
}

function makeTitle(messages: StoredMsg[]): string {
	const first = messages.find((m) => m.role === 'user')?.text ?? 'Neuer Chat';
	return first.replace(/\s+/g, ' ').trim().slice(0, 60) || 'Neuer Chat';
}

/** Liste für die Sidebar (ohne Nachrichten), neueste zuerst. */
export function listChats(): ChatSummary[] {
	return load()
		.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
		.map((c) => ({ id: c.id, title: c.title, updatedAt: c.updatedAt, count: c.messages.length }));
}

export function getChat(id: string): Chat | null {
	return load().find((c) => c.id === id) ?? null;
}

/** Anlegen oder aktualisieren. Ohne id → neuer Chat. Titel aus erster Nachricht. */
export function saveChat(input: { id?: string; messages: StoredMsg[]; title?: string }): Chat {
	const list = load();
	const now = new Date().toISOString();
	if (input.id) {
		const i = list.findIndex((c) => c.id === input.id);
		if (i >= 0) {
			list[i] = {
				...list[i],
				messages: input.messages,
				title: input.title ?? (list[i].title === 'Neuer Chat' ? makeTitle(input.messages) : list[i].title),
				updatedAt: now
			};
			save(list);
			return list[i];
		}
	}
	const chat: Chat = {
		id: input.id ?? randomUUID(),
		title: input.title ?? makeTitle(input.messages),
		messages: input.messages,
		createdAt: now,
		updatedAt: now
	};
	list.push(chat);
	save(list);
	return chat;
}

export function renameChat(id: string, title: string): boolean {
	const list = load();
	const c = list.find((x) => x.id === id);
	if (!c) return false;
	c.title = title.slice(0, 80) || c.title;
	c.updatedAt = new Date().toISOString();
	save(list);
	return true;
}

export function deleteChat(id: string): boolean {
	const list = load();
	const next = list.filter((c) => c.id !== id);
	if (next.length === list.length) return false;
	save(next);
	return true;
}
