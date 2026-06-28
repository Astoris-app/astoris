// KI-Generator für Astoris-Code-Add-ons. Erzeugt aus einer Beschreibung ein
// vollständiges Code-Add-on (id, name, description, inputHint, code) via engineChat.
// Wird von /api/plugins (Aktion generate-addon) UND vom Chat-Werkzeug addon_erstellen
// genutzt — gleiche Logik, eine Quelle. Installiert NICHTS: gibt nur das Add-on zurück.

import { engineChat } from './engine';

export type GeneratedAddon = {
	id: string;
	name: string;
	description: string;
	inputHint?: string;
	code: string;
};

export type GenResult =
	| { ok: true; addon: GeneratedAddon }
	| { ok: false; message: string };

// Muss die Sandbox-Grenzen aus sandbox.ts exakt widerspiegeln, damit die KI nur
// erlaubte Globals nutzt und eine ausführbare run(input)-Funktion erzeugt.
const SYSTEM_PROMPT =
	'Du bist ein Generator für Astoris-Code-Add-ons. Ein Add-on ist serverseitiger JavaScript-Code, ' +
	'der in einer node:vm-Sandbox läuft.\n\n' +
	'STRIKTE SANDBOX-REGELN (der Code MUSS sie einhalten, sonst läuft er nicht):\n' +
	'- Der Code definiert genau eine Funktion: async function run(input) { ... }. Sie MUSS ein Objekt zurückgeben (return { ... }).\n' +
	'- Verfügbare Globals: fetch, JSON, Math, Date, console, crypto, btoa, atob, TextEncoder, TextDecoder, URL, URLSearchParams, FormData, Blob, Uint8Array.\n' +
	'- NICHT verfügbar: require, import, process, fs, __dirname, Node-Module. Kein Datei-, Prozess- oder Modulzugriff.\n' +
	'- fetch ist gehärtet: nur öffentliche http/https-URLs erreichbar (interne/private Adressen werden blockiert).\n' +
	'- Harte Laufzeitgrenze: 5 Sekunden. Keine Endlosschleifen, kein langes Polling.\n' +
	'- input ist das übergebene Parameter-Objekt. Eventuelle API-Keys kommen als Felder in input (über die Add-on-Einstellungen) — NIEMALS Schlüssel hardcoden.\n\n' +
	'Antworte AUSSCHLIESSLICH mit einem einzigen gültigen JSON-Objekt (kein Markdown, kein Fließtext davor/danach) in genau dieser Form:\n' +
	'{\n' +
	'  "id": string,           // kebab-case, nur [a-z0-9-], 2-40 Zeichen, z. B. "wetter-abfrage"\n' +
	'  "name": string,         // kurzer Anzeigename, z. B. "Wetter-Abfrage"\n' +
	'  "description": string,  // ein Satz, was das Add-on tut\n' +
	'  "inputHint": string,    // Beispiel-Eingabe als JSON-String, z. B. "{ \\"stadt\\": \\"Berlin\\" }"\n' +
	'  "code": string          // der vollständige JS-Code mit async function run(input) { ... }\n' +
	'}\n\n' +
	'Regeln für code: robust und funktionsfähig, mit try/catch um fetch. Gib bei Fehlern { fehler: "..." } zurück. ' +
	'Halte den Code kompakt. Im JSON müssen Zeilenumbrüche im code-String als \\n escaped sein (gültiges JSON).';

// Spiegelt MAX_CODE aus plugins.ts (Installations-Validierung) wider.
const MAX_CODE = 50000;
const ID_RE = /^[a-z0-9][a-z0-9-]{1,40}$/;

// Extrahiert das erste JSON-Objekt aus der KI-Antwort (entfernt ```json-Fences,
// schneidet auf das äußerste { … } zu). Wirft bei Misserfolg.
function parseAddonJson(raw: string): unknown {
	let t = (raw ?? '').toString().trim();
	const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
	if (fence) t = fence[1].trim();
	const start = t.indexOf('{');
	const end = t.lastIndexOf('}');
	if (start === -1 || end === -1 || end <= start) throw new Error('no json object');
	return JSON.parse(t.slice(start, end + 1));
}

// Erkennt, ob der Code eine run-Funktion definiert (function run(...) oder run = (…) =>).
function hasRunFn(code: string): boolean {
	return /function\s+run\s*\(/.test(code) || /\brun\s*=\s*(async\s+)?(function|\()/.test(code);
}

// Säubert/leitet eine gültige kebab-case-id ab (aus id, sonst aus name). '' = ungültig.
function cleanId(rawId: unknown, name: string): string {
	const norm = (s: string) =>
		s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').replace(/-{2,}/g, '-').slice(0, 40);
	let id = norm((rawId ?? '').toString());
	if (!ID_RE.test(id)) id = norm(name);
	return ID_RE.test(id) ? id : '';
}

// Bringt das rohe KI-JSON in ein sauberes Add-on-Modell. null = ungültig (run fehlt / id ungültig).
function normalizeAddon(raw: unknown, fallbackDesc: string): GeneratedAddon | null {
	const o = (raw ?? {}) as Record<string, unknown>;
	const code = (o.code ?? '').toString();
	if (!code || code.length > MAX_CODE || !hasRunFn(code)) return null;
	const name = (o.name ?? '').toString().trim().slice(0, 80) || 'KI-Add-on';
	const id = cleanId(o.id, name);
	if (!id) return null;
	const description = (o.description ?? fallbackDesc).toString().trim().slice(0, 200);
	const hintRaw = o.inputHint != null ? o.inputHint.toString().trim().slice(0, 300) : '';
	return { id, name, description, ...(hintRaw ? { inputHint: hintRaw } : {}), code };
}

// Sentinel: erzwingt eine WERKZEUGFREIE engineChat-Runde (allowedTools filtert auf
// einen nicht existierenden Namen → leere Tool-Liste). Verhindert Rekursion, wenn der
// Generator aus dem Chat-Werkzeug addon_erstellen heraus aufgerufen wird.
const NO_TOOLS = ['__addongen_no_tools__'];

/** Generiert aus einer Beschreibung ein Code-Add-on. 2 Versuche (lokale Modelle liefern
 *  JSON nicht immer sauber). Skip-on-fail: source 'demo' → ok:false mit klarer Meldung. */
export async function generateAddon(description: string): Promise<GenResult> {
	const desc = (description ?? '').toString().trim();
	if (!desc) return { ok: false, message: 'Bitte beschreibe, was die Erweiterung tun soll.' };
	for (let attempt = 0; attempt < 2; attempt++) {
		const res = await engineChat(
			[
				{ role: 'system', content: SYSTEM_PROMPT },
				{ role: 'user', content: `Beschreibung der gewünschten Erweiterung: ${desc}` }
			],
			null,
			NO_TOOLS
		);
		if (res.source === 'demo') return { ok: false, message: res.reply };
		try {
			const addon = normalizeAddon(parseAddonJson(res.reply), desc.slice(0, 200));
			if (addon) return { ok: true, addon };
		} catch {
			/* nächster Versuch */
		}
	}
	return {
		ok: false,
		message: 'Die KI hat kein gültiges Add-on geliefert (kein ausführbarer Code). Bitte die Beschreibung schärfen und erneut versuchen.'
	};
}
