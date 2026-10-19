import { existsSync, readFileSync } from 'node:fs';
import { normalize, isAbsolute } from 'node:path';
import { error } from '@sveltejs/kit';
import { runtimeStore } from './runtime';
import { DocumentStore } from './runtime/documents';
import { documentVersions } from './runtime/context';
import { encrypt, decrypt } from './crypto';

let instance: DocumentStore | undefined;
const fallbackVersions = new Map<string, number>();
function store() { return instance ??= new DocumentStore(runtimeStore().db, { encrypt, decrypt }); }
function key(file: string) {
	const normalized = normalize(file);
	if (isAbsolute(file) || !normalized.startsWith('data/')) throw new Error('Ungültiger Dokumentpfad.');
	return normalized.slice(5);
}
function versions() { return documentVersions.getStore() ?? fallbackVersions; }

/** Import each legacy JSON once. Keep the original file untouched as an additional recovery source. */
export function readDocument<T>(file: string, fallback: T): T {
	const id = key(file);
	try {
		const result = store().read<T>(id, () => existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) as T : fallback);
		versions().set(id, result.version); return result.value;
	} catch (e) { versions().set(id, -1); throw e; }
}

export function writeDocument(file: string, value: unknown) {
	const id = key(file);
	if (!versions().has(id)) readDocument(file, null);
	if (versions().get(id) === -1) throw error(503, 'Datenspeicher konnte nicht gelesen werden. Kein Überschreiben erlaubt.');
	try { versions().set(id, store().write(id, value, versions().get(id)!)); }
	catch { throw error(409, 'Daten wurden zwischenzeitlich geändert. Bitte neu laden.'); }
}
