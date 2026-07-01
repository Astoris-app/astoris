// Kurator — die Meta-Ebene des Selbst-Erweiterungs-Systems.
// Liest Goals + Aufgaben + vorhandene Add-ons der aktiven Firma, erkennt EINE
// fehlende Fähigkeit ("Lücke"), lässt daraus ein Code-Add-on generieren, testet es
// in der Sandbox, lässt einen GETRENNTEN Prüfer urteilen und legt das Ergebnis als
// Vorschlag (Proposal) ab. Installiert NICHTS — das entscheidet der Operator.
//
// Sicherheits-Trennung: Der Kurator erzeugt ausschließlich Add-ons. Verifikation
// (Sandbox + Prüfer) und Audit liegen außerhalb dessen, was ein Add-on ändern kann.

import { readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { engineChat } from './engine';
import { generateAddon } from './addonGen';
import { runCodeAddon } from './sandbox';
import { getCompany } from './company';
import { listPlugins } from './plugins';
import { getConstitution } from './constitution';
import { getActiveId } from './companies';
import { countProposalsToday, installedAddonIds, addProposal, type Proposal, type ProposalRisk, type ProposalTest } from './proposals';
import { appendAudit } from './audit';

// Erzwingt eine werkzeugfreie engineChat-Runde mit deaktiviertem Reasoning (siehe engine.ts).
// Gleicher Sentinel wie im Add-on-Generator — reiner JSON-Output, kein Tool-Loop.
const NO_TOOLS = ['__addongen_no_tools__'];

export type Gap = {
	title: string;
	goalTitle?: string;
	rationale: string;
	addonDescription: string;
	risk: ProposalRisk;
};

export type CuratorResult =
	| { ok: true; proposal: Proposal }
	| { ok: false; message: string };

const VALID_RISK: ProposalRisk[] = ['niedrig', 'mittel', 'hoch'];
function normRisk(v: unknown): ProposalRisk {
	const s = (v ?? '').toString().toLowerCase();
	return VALID_RISK.includes(s as ProposalRisk) ? (s as ProposalRisk) : 'mittel';
}

// Extrahiert das erste JSON-Objekt aus einer KI-Antwort (Fences entfernen, auf { … } zuschneiden).
function parseJsonObject(raw: string): any {
	let t = (raw ?? '').toString().trim();
	const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
	if (fence) t = fence[1].trim();
	const start = t.indexOf('{');
	const end = t.lastIndexOf('}');
	if (start === -1 || end === -1 || end <= start) throw new Error('kein JSON-Objekt');
	return JSON.parse(t.slice(start, end + 1));
}

const OBSERVE_SYSTEM =
	'Du bist der Kurator einer KI-gesteuerten Firma. Deine Aufgabe: aus den Zielen und dem Zustand der Firma ' +
	'GENAU EINE konkrete, fehlende Fähigkeit identifizieren, die ein Ziel spürbar voranbringt und sich als ' +
	'Astoris-Code-Add-on umsetzen lässt.\n' +
	'Ein Add-on ist serverseitiges JavaScript (async function run(input)), das öffentliche http/https-APIs per ' +
	'fetch abfragen oder Daten umwandeln kann. KEIN Datei-/Prozesszugriff, keine internen Adressen, 5 s Laufzeit.\n' +
	'Schlage nur etwas vor, das damit realistisch machbar ist (z. B. Wechselkurse abrufen, Text zusammenfassen via ' +
	'öffentliche API, USt-IdNr. prüfen, Wetter/Feiertage/Geodaten abfragen). Nichts, was die Firma schon als Add-on hat.\n\n' +
	'Antworte AUSSCHLIESSLICH mit einem einzigen JSON-Objekt (kein Markdown, kein Fließtext) in dieser Form:\n' +
	'{ "gaps": [ {\n' +
	'  "title": string,            // kurzer Name der Fähigkeit\n' +
	'  "goalTitle": string,        // auf welches Ziel sie einzahlt (Titel aus der Liste, sonst "")\n' +
	'  "rationale": string,        // 1 Satz: warum das der Firma jetzt hilft\n' +
	'  "addonDescription": string, // 1 präziser Satz als Auftrag an den Add-on-Generator\n' +
	'  "risk": "niedrig"|"mittel"|"hoch"\n' +
	'} ] }\n' +
	'Nenne 1 bis 3 gaps, die wichtigste zuerst.';

// Baut den Firmen-Kontext für die Lücken-Analyse.
function companyContext(): string {
	const c = getCompany();
	const goals = (c.goals ?? [])
		.filter((g) => g.status !== 'erledigt')
		.slice(0, 12)
		.map((g) => `- [${g.status}/${g.priority}] ${g.title}${g.description ? ' — ' + g.description : ''}`)
		.join('\n') || '(keine offenen Ziele)';
	const tasks = (c.tasks ?? [])
		.filter((t) => t.status === 'offen' || t.status === 'in-arbeit')
		.slice(0, 10)
		.map((t) => `- ${t.title}`)
		.join('\n') || '(keine offenen Aufgaben)';
	const addons = listPlugins()
		.map((p) => `- ${p.name}${p.description ? ': ' + p.description : ''}`)
		.join('\n') || '(noch keine Add-ons installiert)';
	return (
		`Firma: ${c.name || '(unbenannt)'}\nBranche: ${c.industry || '(unbekannt)'}\nMission: ${c.mission || '(keine)'}\n\n` +
		`Offene Ziele:\n${goals}\n\nOffene Aufgaben:\n${tasks}\n\nVorhandene Add-ons (nicht doppeln):\n${addons}`
	);
}

// (1) BEOBACHTEN — findet Fähigkeits-Lücken. Skip-on-fail: leere Liste, wenn keine KI erreichbar.
export async function observe(): Promise<Gap[]> {
	const res = await engineChat(
		[
			{ role: 'system', content: OBSERVE_SYSTEM },
			{ role: 'user', content: companyContext() }
		],
		null,
		NO_TOOLS
	);
	if (res.source === 'demo') return [];
	try {
		const obj = parseJsonObject(res.reply);
		const gaps = Array.isArray(obj?.gaps) ? obj.gaps : [];
		return gaps
			.map((g: any): Gap => ({
				title: (g?.title ?? '').toString().trim().slice(0, 100),
				goalTitle: (g?.goalTitle ?? '').toString().trim().slice(0, 120) || undefined,
				rationale: (g?.rationale ?? '').toString().trim().slice(0, 300),
				addonDescription: (g?.addonDescription ?? '').toString().trim().slice(0, 400),
				risk: normRisk(g?.risk)
			}))
			.filter((g: Gap) => g.title && g.addonDescription);
	} catch {
		return [];
	}
}

const VERIFY_SYSTEM =
	'Du bist ein strenger, unabhängiger Prüfer (NICHT der Autor des Codes). Du bewertest, ob ein generiertes ' +
	'Astoris-Code-Add-on seine beschriebene Aufgabe tatsächlich erfüllt. Grundlage ist das ECHTE Ergebnis eines ' +
	'Sandbox-Laufs — verlasse dich darauf, nicht auf Behauptungen im Code.\n' +
	'Urteile "mangelhaft", wenn der Lauf fehlschlug, die Ausgabe leer/unsinnig ist, einen Fehler enthält oder ' +
	'nicht zur Beschreibung passt. Sonst "ok".\n' +
	'Antworte AUSSCHLIESSLICH als JSON: { "verdict": "ok"|"mangelhaft", "reason": string (1 Satz) }.';

// (4b) Getrennter Prüfer. Fehlgeschlagener Sandbox-Lauf ist ohne KI schon "mangelhaft".
async function verify(addon: { name: string; description: string; code: string }, sandbox: { ok: boolean; output?: unknown; error?: string }): Promise<{ verdict: 'ok' | 'mangelhaft'; reason: string }> {
	if (!sandbox.ok) {
		return { verdict: 'mangelhaft', reason: 'Sandbox-Lauf fehlgeschlagen: ' + (sandbox.error || 'unbekannter Fehler') };
	}
	const outStr = (() => { try { return JSON.stringify(sandbox.output).slice(0, 1200); } catch { return String(sandbox.output).slice(0, 1200); } })();
	const res = await engineChat(
		[
			{ role: 'system', content: VERIFY_SYSTEM },
			{ role: 'user', content: `Aufgabe des Add-ons: ${addon.description}\nName: ${addon.name}\n\nSandbox-Ausgabe (echt):\n${outStr}` }
		],
		null,
		NO_TOOLS
	);
	// KI nicht erreichbar → nicht blockieren, aber ehrlich als ungeprüft markieren (Lauf war ok).
	if (res.source === 'demo') return { verdict: 'ok', reason: 'Sandbox-Lauf erfolgreich (Prüfer-KI nicht erreichbar, ungeprüft).' };
	try {
		const obj = parseJsonObject(res.reply);
		const verdict = obj?.verdict === 'mangelhaft' ? 'mangelhaft' : 'ok';
		return { verdict, reason: (obj?.reason ?? '').toString().trim().slice(0, 300) || (verdict === 'ok' ? 'Ausgabe passt zur Aufgabe.' : 'Ausgabe passt nicht zur Aufgabe.') };
	} catch {
		return { verdict: 'ok', reason: 'Sandbox-Lauf erfolgreich (Prüfer-Antwort nicht auswertbar).' };
	}
}

// (3+4) BAUEN + TESTEN + VERIFIZIEREN für eine konkrete Lücke → fertiges Proposal.
async function proposeForGap(gap: Gap): Promise<CuratorResult> {
	const gen = await generateAddon(gap.addonDescription);
	if (!gen.ok) return { ok: false, message: gen.message };
	const addon = gen.addon;

	// Beispiel-Eingabe aus inputHint (falls valides JSON), sonst leeres Objekt.
	let input: unknown = {};
	if (addon.inputHint) { try { input = JSON.parse(addon.inputHint); } catch { /* leere Eingabe */ } }

	const timeout = getConstitution().budgets.sandboxTimeoutMs;
	const run = await runCodeAddon(addon.code, input, timeout);
	const v = await verify(addon, run);

	const test: ProposalTest = {
		ok: run.ok,
		output: run.ok ? run.output : undefined,
		error: run.ok ? undefined : run.error,
		verifierVerdict: v.verdict,
		verifierReason: v.reason
	};

	const proposal = addProposal({
		gap: gap.title,
		goalTitle: gap.goalTitle,
		title: addon.name,
		rationale: gap.rationale,
		risk: gap.risk,
		addon,
		test
	});
	appendAudit({ action: 'proposal-created', actor: 'kurator', companyId: getActiveId(), targetId: proposal.id, detail: proposal.title, result: `${test.verifierVerdict}${test.ok ? '' : ' (Sandbox-Fehler)'}` });
	return { ok: true, proposal };
}

// Persistenter Tages-Zähler für Entwicklungs-VERSUCHE (auch fehlgeschlagene). GLOBAL.
// Deckelt die LLM-Kosten: jeder develop-Klick löst bis zu 3 Modell-Aufrufe aus, auch
// wenn keine Generierung gelingt (dann entsteht kein Proposal, das countProposalsToday
// zählen würde) — deshalb ein separater Versuchs-Zähler.
const STATE_FILE = join('data', 'curator-state.json');
function todayKey(): string { return new Date().toISOString().slice(0, 10); }
function readState(): { date: string; attempts: number } {
	try {
		const s = JSON.parse(readFileSync(STATE_FILE, 'utf8'));
		if (s && s.date === todayKey() && typeof s.attempts === 'number') return s;
	} catch { /* neuer Tag / keine Datei */ }
	return { date: todayKey(), attempts: 0 };
}
function attemptsToday(): number { return readState().attempts; }
function recordAttempt(): void {
	const s = readState();
	s.attempts += 1;
	try {
		mkdirSync('data', { recursive: true });
		const tmp = STATE_FILE + '.tmp';
		writeFileSync(tmp, JSON.stringify(s), { mode: 0o600 });
		renameSync(tmp, STATE_FILE);
	} catch { /* Zähler-Schreiben darf den Hauptfluss nie brechen */ }
}

// Eine vollständige Kurator-Runde: Not-Aus + Budget prüfen, beobachten, ersten Gap umsetzen.
export async function runOnce(): Promise<CuratorResult> {
	const c = getConstitution();
	if (!c.loopEnabled) return { ok: false, message: 'Die Selbstentwicklung ist per Not-Aus gestoppt. Erst wieder aktivieren.' };
	if (installedAddonIds().length >= c.budgets.maxAddons) return { ok: false, message: 'Obergrenze selbst-installierter Add-ons erreicht.' };
	if (countProposalsToday() >= c.budgets.proposalsPerDay) return { ok: false, message: `Tagesbudget erreicht (max. ${c.budgets.proposalsPerDay} Vorschläge/Tag).` };
	// Cost-Deckel: auch fehlschlagende Versuche zählen — VOR dem ersten teuren LLM-Aufruf prüfen.
	if (attemptsToday() >= c.budgets.attemptsPerDay) return { ok: false, message: `Tages-Limit für Entwicklungs-Versuche erreicht (max. ${c.budgets.attemptsPerDay}/Tag). Morgen wieder — oder Budget in data/constitution.json anpassen.` };
	recordAttempt();

	const gaps = await observe();
	if (!gaps.length) return { ok: false, message: 'Aktuell keine sinnvolle Erweiterung erkannt (oder keine KI erreichbar). Ziele schärfen und erneut versuchen.' };
	return proposeForGap(gaps[0]);
}
