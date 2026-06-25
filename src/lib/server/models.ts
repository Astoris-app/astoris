// Modell-Auswahl für den Assistent: verfügbare Modelle je Quelle + persistente Wahl.
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { getDecrypted } from './store';

const FILE = 'data/selected-model.json';
export type SelectedModel = { source: 'local' | 'cloud'; model: string };
export type ModelOption = { id: string; label: string; source: 'local' | 'cloud'; model: string };

export function getSelectedModel(): SelectedModel | null {
	try {
		if (existsSync(FILE)) {
			const v = JSON.parse(readFileSync(FILE, 'utf8'));
			if (v && (v.source === 'local' || v.source === 'cloud')) return { source: v.source, model: v.model ?? '' };
		}
	} catch { /* keine Wahl */ }
	return null;
}
export function setSelectedModel(s: SelectedModel | null) {
	mkdirSync('data', { recursive: true });
	writeFileSync(FILE, JSON.stringify(s ?? {}), { mode: 0o600 });
}
/** Liste der wählbaren Modelle, abhängig von den konfigurierten Quellen. */
export function availableModels(): ModelOption[] {
	const list: ModelOption[] = [];
	const lm = getDecrypted('local-models');
	if (lm?.plain?.base_url) list.push({ id: 'local', label: 'Lokales Modell', source: 'local', model: '' });
	const cloud = getDecrypted('cloud-ai');
	if (cloud?.plain?.api_key) {
		const prov = (cloud.plain.provider || '').toLowerCase();
		if (prov.includes('anthropic') || prov.includes('claude')) {
			list.push({ id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6', source: 'cloud', model: 'claude-sonnet-4-6' });
			list.push({ id: 'claude-opus-4-8', label: 'Claude Opus 4.8', source: 'cloud', model: 'claude-opus-4-8' });
			list.push({ id: 'claude-haiku', label: 'Claude Haiku 4.5', source: 'cloud', model: 'claude-haiku-4-5-20251001' });
		} else if (prov.includes('openai')) {
			list.push({ id: 'gpt-4o', label: 'GPT-4o', source: 'cloud', model: 'gpt-4o' });
			list.push({ id: 'gpt-4o-mini', label: 'GPT-4o mini', source: 'cloud', model: 'gpt-4o-mini' });
		} else {
			list.push({ id: 'cloud', label: 'Cloud-Modell', source: 'cloud', model: '' });
		}
	}
	return list;
}
