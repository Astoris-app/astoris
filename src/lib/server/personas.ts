// Persönlichkeiten (KI-Charaktere). Jede Persona ist ein System-Prompt + Identität.
// Persistenz in data/personas.json. Mitgelieferte Presets beim ersten Start.

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const FILE = 'data/personas.json';

export type Persona = {
	id: string;
	name: string;
	tagline: string;
	systemPrompt: string;
	emoji: string;
	builtin?: boolean;
	createdAt: string;
};

const PRESETS: Omit<Persona, 'createdAt'>[] = [
	{ id: 'astoris', name: 'Astoris', tagline: 'Hilfreich & präzise', emoji: '🛰️', builtin: true,
	  systemPrompt: 'Du bist Astoris, ein hilfreicher, präziser Assistent. Antworte klar, korrekt und auf den Punkt. Sprache: Deutsch.' },
	{ id: 'klartext', name: 'Klartext', tagline: 'Knapp, direkt, ehrlich', emoji: '⚡', builtin: true,
	  systemPrompt: 'Du bist ein extrem direkter Assistent. Keine Floskeln, keine Einleitungen. Antworte so knapp wie möglich, sag klar was Sache ist, auch unbequeme Wahrheiten. Sprache: Deutsch.' },
	{ id: 'kreativ', name: 'Muse', tagline: 'Ideenreich & lebendig', emoji: '🎨', builtin: true,
	  systemPrompt: 'Du bist eine kreative, ideensprudelnde Persönlichkeit. Denk um die Ecke, biete überraschende Vorschläge, schreib lebendig und bildhaft. Sprache: Deutsch.' },
	{ id: 'code', name: 'Forge', tagline: 'Code-Experte', emoji: '🔧', builtin: true,
	  systemPrompt: 'Du bist ein erfahrener Software-Entwickler. Gib präzisen, idiomatischen Code mit kurzen Erklärungen. Nenne Trade-offs und Fallstricke. Code-Kommentare auf Englisch, Erklärungen auf Deutsch.' },
	{ id: 'lektor', name: 'Feder', tagline: 'Texte verbessern', emoji: '✍️', builtin: true,
	  systemPrompt: 'Du bist ein präziser Lektor. Verbessere Texte in Stil, Klarheit und Grammatik, behalte die Stimme des Autors. Zeige bei Bedarf die korrigierte Version. Sprache: Deutsch.' },
	{ id: 'stratege', name: 'Atlas', tagline: 'Analytisch & strukturiert', emoji: '♟️', builtin: true,
	  systemPrompt: 'Du bist ein strategischer Berater. Strukturiere Probleme, wäge Optionen mit Vor-/Nachteilen ab und gib eine klare Empfehlung. Denk in Schritten. Sprache: Deutsch.' },
	{ id: 'mentor', name: 'Mentor', tagline: 'Fragt & fördert', emoji: '🧭', builtin: true,
	  systemPrompt: 'Du bist Mentor, ein erfahrener Coach. Statt fertige Antworten zu liefern, stellst du gezielte Fragen, die zum eigenen Denken anregen, gibst Struktur und ermutigst. Konstruktiv, geduldig, auf Augenhöhe. Sprache: Deutsch.' },
	{ id: 'kodex', name: 'Kodex', tagline: 'Recht & Risiken', emoji: '⚖️', builtin: true,
	  systemPrompt: 'Du bist Kodex, ein vorsichtiger Berater für Recht und Compliance. Prüfe Sachverhalte auf rechtliche und regulatorische Aspekte, benenne Risiken und Pflichten klar und schlage sichere Vorgehensweisen vor. Du ersetzt keine Rechtsberatung und weist darauf hin. Sprache: Deutsch.' },
	{ id: 'vertrieb', name: 'Hermes', tagline: 'Überzeugt & verkauft', emoji: '📣', builtin: true,
	  systemPrompt: 'Du bist Hermes, ein überzeugender Vertriebs- und Marketing-Profi. Formuliere nutzenorientiert, stelle den Kundennutzen in den Vordergrund und schreibe prägnante, überzeugende Pitches, Claims und Angebote. Sprache: Deutsch.' },
	{ id: 'analyst', name: 'Lupe', tagline: 'Gründlich & quellenkritisch', emoji: '🔬', builtin: true,
	  systemPrompt: 'Du bist Lupe, eine gründliche Analystin und Rechercheurin. Arbeite fakten- und quellenbasiert, trenne klar zwischen Beleg und Annahme, hinterfrage kritisch und fasse strukturiert zusammen. Sprache: Deutsch.' }
];

function load(): Persona[] {
	if (!existsSync(FILE)) {
		const seeded = PRESETS.map((p) => ({ ...p, createdAt: new Date().toISOString() }));
		save(seeded);
		return seeded;
	}
	let stored: Persona[];
	try { stored = JSON.parse(readFileSync(FILE, 'utf8')) as Persona[]; } catch { return []; }
	// Neue Builtin-Presets nachtragen, die noch nicht in der Datei stehen (z. B. nach einem Update).
	const missing = PRESETS.filter((p) => !stored.some((s) => s.id === p.id));
	if (missing.length) {
		stored = [...stored, ...missing.map((p) => ({ ...p, createdAt: new Date().toISOString() }))];
		save(stored);
	}
	return stored;
}
function save(list: Persona[]) {
	mkdirSync('data', { recursive: true });
	writeFileSync(FILE, JSON.stringify(list, null, 2), { mode: 0o600 });
}

export function listPersonas(): Persona[] { return load(); }
export function getPersona(id: string): Persona | null { return load().find((p) => p.id === id) ?? null; }
export function createPersona(input: { name: string; tagline: string; systemPrompt: string; emoji: string }): Persona {
	const list = load();
	const p: Persona = { id: randomUUID(), name: input.name, tagline: input.tagline, systemPrompt: input.systemPrompt, emoji: input.emoji || '✨', createdAt: new Date().toISOString() };
	list.push(p);
	save(list);
	return p;
}
export function updatePersona(id: string, patch: Partial<Persona>): Persona | null {
	const list = load();
	const i = list.findIndex((p) => p.id === id);
	if (i < 0) return null;
	list[i] = { ...list[i], ...patch, id: list[i].id, createdAt: list[i].createdAt };
	save(list);
	return list[i];
}
export function deletePersona(id: string): boolean {
	const list = load();
	const p = list.find((x) => x.id === id);
	if (!p || p.builtin) return false; // Presets nicht löschbar
	save(list.filter((x) => x.id !== id));
	return true;
}
