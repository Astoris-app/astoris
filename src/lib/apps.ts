// Astoris — App-Registry. Jede App ist ein Bereich des Workspace.
// `icon` ist SVG-Path-Data (24×24, stroke-basiert), gerendert in <Icon>.
//
// Navigations-Konzept „Firmengebäude": die Apps sind auf vier Etagen (floors)
// verteilt. „uebersicht" ist der Eingang/die Lobby und steht über den Etagen.

// Etagen-IDs. 'eingang' ist die Lobby (kein eigenes Stockwerk), der Rest sind
// die vier Etagen des Firmengebäudes.
export type Floor = 'eingang' | 'leitung' | 'wachstum' | 'arbeitsplatz' | 'technik';

export type AppDef = {
	id: string;
	label: string;
	href: string;
	icon: string;
	/** Etage im „Firmengebäude" */
	floor: Floor;
	/** Grobe Gruppe (Alltags-Apps vs. System) — bleibt für Kompatibilität erhalten */
	group: 'work' | 'system';
	/** Kurzbeschreibung für leere Zustände / Tooltips */
	blurb: string;
	/** Welche Engine-Fähigkeit dahinterliegt (für Status/Plugin-Logik) */
	capability: string;
	ready: boolean;
};

// Etagen-Definition: Reihenfolge, Label-Key (i18n) und Etagen-Icon.
export type FloorDef = {
	id: Exclude<Floor, 'eingang'>;
	/** i18n-Key, z. B. 'floor.leitung' */
	labelKey: string;
	icon: string;
};

export const FLOORS: FloorDef[] = [
	// 1 · Leitung — Steuerung & Strategie der Firma
	{ id: 'leitung', labelKey: 'floor.leitung', icon: 'M4 21V10l8-6 8 6v11M4 21h16M9 21v-6h6v6M3 10l9-6.7L21 10' },
	// 2 · Wachstum — Vertrieb, Marketing, Zahlen
	{ id: 'wachstum', labelKey: 'floor.wachstum', icon: 'M4 19V5M4 19h16M7 15l3.5-3.5 3 2L19 7M19 7h-3.5M19 7v3.5' },
	// 3 · Arbeitsplatz — tägliche Werkzeuge
	{ id: 'arbeitsplatz', labelKey: 'floor.arbeitsplatz', icon: 'M4 8.5h16v11H4zM8.5 8.5V6a1.5 1.5 0 0 1 1.5-1.5h4A1.5 1.5 0 0 1 15.5 6v2.5M4 13h16' },
	// 4 · Technik — Verbindungen, Erweiterungen, Sicherheit
	{ id: 'technik', labelKey: 'floor.technik', icon: 'M11.5 4.5 7 9l-2.5-.6L3 11l3 1 1 3 1.8-1.5L9 11l4.5-4.5M14 10l6 6-2 2-6-6M15.5 14.5 18 17' }
];

// Die Lobby/„Eingang"-App — steht in der Leiste ganz oben, über den Etagen.
export const OVERVIEW_APP: AppDef = {
	id: 'uebersicht',
	label: 'Übersicht',
	href: '/uebersicht',
	floor: 'eingang',
	group: 'work',
	ready: true,
	capability: 'overview',
	blurb: 'Die Lobby deines Firmengebäudes — Live-Status und alle Etagen auf einen Blick.',
	icon: 'M12 3 3 9.5V20a1 1 0 0 0 1 1h5v-6h6v6h5a1 1 0 0 0 1-1V9.5zM3 9.5h18'
};

export const APPS: AppDef[] = [
	// ---------- Etage 1 · Leitung ----------
	{
		id: 'firma',
		label: 'Cockpit',
		href: '/firma',
		floor: 'leitung',
		group: 'work',
		ready: true,
		capability: 'agents',
		blurb: 'Wo steht deine Firma? Ziele, Fortschritt, Agenten-Aktivität und Handlungsbedarf auf einen Blick.',
		icon: 'M4 4h7v7H4zM13 4h7v5h-7zM13 11h7v9h-7zM4 13h7v7H4z'
	},
	{
		id: 'agents',
		label: 'Team',
		href: '/agents',
		floor: 'leitung',
		group: 'work',
		ready: true,
		capability: 'agents',
		blurb: 'Mehrere KI-Agenten arbeiten an Aufgaben zusammen — du behältst die Kontrolle.',
		icon: 'M12 3.5a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM5 20a4 4 0 0 1 14 0M5.5 11.5a2.2 2.2 0 1 0 0-.01M18.5 11.5a2.2 2.2 0 1 0 0-.01'
	},
	{
		id: 'optimierung',
		label: 'Optimierung',
		href: '/optimierung',
		floor: 'leitung',
		group: 'work',
		ready: true,
		capability: 'optimization',
		blurb: 'Maßnahme → messen → KI bewertet → Learning. Experimente an deinen Kennzahlen testen und systematisch dazulernen.',
		icon: 'M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z'
	},
	{
		id: 'entscheidungen',
		label: 'Entscheidungen',
		href: '/entscheidungen',
		floor: 'leitung',
		group: 'work',
		ready: true,
		capability: 'agents',
		blurb: 'Alle offenen Freigaben an einem Ort — freigeben oder ablehnen, was deine Agenten vorbereitet haben.',
		icon: 'M5 7.5h11M5 12h7M5 16.5h5M14 16l2.2 2.2L21 13.5'
	},

	// ---------- Etage 2 · Wachstum ----------
	{
		id: 'crm',
		label: 'CRM',
		href: '/crm',
		floor: 'wachstum',
		group: 'work',
		ready: true,
		capability: 'crm',
		blurb: 'Kontakte und Leads, Deal-Pipeline und Produkte — dein leichtgewichtiges CRM.',
		icon: 'M4 5.5h16v13H4zM4 9.5h16M9 14a1.6 1.6 0 1 0 0-.01M7 17c0-1.1.9-1.9 2-1.9s2 .8 2 1.9M14 13h3M14 16h3'
	},
	{
		id: 'marketing',
		label: 'Marketing',
		href: '/marketing',
		floor: 'wachstum',
		group: 'work',
		ready: true,
		capability: 'marketing',
		blurb: 'KI-gestützte Marketing-Werkzeuge: Content-Ideen, Social-Posts, Anzeigen und Kampagnenpläne — im Ton deiner Marke.',
		icon: 'M3 11v2a1 1 0 0 0 1 1h3l5 4V6L7 10H4a1 1 0 0 0-1 1zM16 9a4 4 0 0 1 0 6M19 6a8 8 0 0 1 0 12'
	},
	{
		id: 'metrics',
		label: 'Kennzahlen',
		href: '/metrics',
		floor: 'wachstum',
		group: 'work',
		ready: true,
		capability: 'metrics',
		blurb: 'Deine wichtigsten Kennzahlen mit Verlauf und Trend — manuell gepflegt, jederzeit im Blick.',
		icon: 'M4 19V5M4 19h16M8 16l3.5-4 3 2.5L20 8'
	},

	// ---------- Etage 3 · Arbeitsplatz ----------
	{
		id: 'chat',
		label: 'Assistent',
		href: '/',
		floor: 'arbeitsplatz',
		group: 'work',
		ready: true,
		capability: 'chat',
		blurb: 'Sprich mit deiner KI — sie kennt deinen Kontext und steuert deine Verbindungen.',
		icon: 'M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v7A2.5 2.5 0 0 1 17.5 15H9l-4.2 3.4A.6.6 0 0 1 4 17.9z'
	},
	{
		id: 'mail',
		label: 'Posteingang',
		href: '/mail',
		floor: 'arbeitsplatz',
		group: 'work',
		ready: true,
		capability: 'email',
		blurb: 'E-Mails über alle Konten, KI-Triage und Antwort-Entwürfe — versendet wird nur auf Klick.',
		icon: 'M3.5 6.5h17v11h-17zM3.8 7l8.2 6 8.2-6'
	},
	{
		id: 'calls',
		label: 'Anrufe',
		href: '/calls',
		floor: 'arbeitsplatz',
		group: 'work',
		ready: true,
		capability: 'telephony',
		blurb: 'Intelligente Voicemail: eingehende Anrufe werden begrüßt, aufgezeichnet, transkribiert und von der KI zusammengefasst.',
		icon: 'M6 3.5l2.2 4-1.6 1.6a12 12 0 0 0 6.3 6.3l1.6-1.6 4 2.2v3.2A1.6 1.6 0 0 1 17 21 15 15 0 0 1 3 7a1.6 1.6 0 0 1 1.8-1.7z'
	},
	{
		id: 'docs',
		label: 'Dokumente',
		href: '/docs',
		floor: 'arbeitsplatz',
		group: 'work',
		ready: true,
		capability: 'rag',
		blurb: 'Dein Wissensspeicher: Dokumente hochladen, durchsuchen, von der KI auswerten lassen.',
		icon: 'M6 3.5h7l5 5v12H6zM13 3.5V8.5h5M9 13h6M9 16.5h6'
	},
	{
		id: 'research',
		label: 'Recherche',
		href: '/research',
		floor: 'wachstum',
		group: 'work',
		ready: true,
		capability: 'web',
		blurb: 'Mehrstufige Web-Recherche mit Quellenprüfung und Bericht.',
		icon: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM16 16l4 4'
	},
	{
		id: 'studio',
		label: 'Studio',
		href: '/studio',
		floor: 'arbeitsplatz',
		group: 'work',
		ready: true,
		capability: 'image',
		blurb: 'Bilder erzeugen und analysieren — lokal mit FLUX und Vision-Modellen.',
		icon: 'M4 5.5h16v13H4zM4 15l4.5-4.5 4 4 3-3L20 15M9 9.5a1.2 1.2 0 1 0 0-.01'
	},
	{
		id: 'calendar',
		label: 'Kalender',
		href: '/calendar',
		floor: 'arbeitsplatz',
		group: 'work',
		ready: true,
		capability: 'calendar',
		blurb: 'Termine über verbundene Kalender — die KI plant, erinnert, koordiniert.',
		icon: 'M4.5 6h15v13.5h-15zM4.5 10h15M8 3.5v4M16 3.5v4'
	},

	// ---------- Etage 4 · Technik ----------
	{
		id: 'connections',
		label: 'Verbindungen',
		href: '/connections',
		floor: 'technik',
		group: 'system',
		ready: true,
		capability: 'connections',
		blurb: 'Verbinde deine Alltags-Konten. Die KI darf nur, was du ihr hier erlaubst.',
		icon: 'M9 15l-2.5 2.5a3 3 0 0 1-4.2-4.2L4.8 10.5M15 9l2.5-2.5a3 3 0 0 1 4.2 4.2L19.2 13.5M9 15l6-6'
	},
	{
		id: 'erweiterungen',
		label: 'Erweiterungen',
		href: '/erweiterungen',
		floor: 'technik',
		group: 'system',
		ready: true,
		capability: 'plugins',
		blurb: 'Add-ons installieren und verwalten — erweitere Astoris.',
		icon: 'M4 8V5a1 1 0 0 1 1-1h3a2 2 0 1 1 4 0h3a1 1 0 0 1 1 1v3a2 2 0 1 0 0 4v3a1 1 0 0 1-1 1h-3a2 2 0 1 0-4 0H5a1 1 0 0 1-1-1v-3a2 2 0 1 1 0-4z'
	},
	{
		id: 'tresor',
		label: 'Tresor',
		href: '/tresor',
		floor: 'technik',
		group: 'system',
		ready: true,
		capability: 'crypto',
		blurb: 'Nachrichten & Dateien Ende-zu-Ende verschlüsseln und sicher versenden.',
		icon: 'M6 10V8a6 6 0 0 1 12 0v2M5 10h14v10H5zM12 14v3'
	},
	{
		id: 'logs',
		label: 'Systemprotokoll',
		href: '/logs',
		floor: 'technik',
		group: 'system',
		ready: true,
		capability: 'logs',
		blurb: 'Das Logbuch deines Maschinenraums: KI-Läufe, Engine-Status und Fehler — neueste zuerst.',
		icon: 'M5 4h11l3 3v13H5zM9 9h6M9 12.5h6M9 16h4'
	},
	{
		id: 'einrichtung',
		label: 'Einrichtung',
		href: '/welcome?replay=1',
		floor: 'technik',
		group: 'system',
		ready: true,
		capability: 'onboarding',
		blurb: 'Der Einrichtungs-Assistent: KI-Modell und E-Mail verbinden, jederzeit erneut starten.',
		icon: 'M12 3l1.8 4.6L18.5 9l-3.5 3 1 4.8L12 14.5 8 16.8l1-4.8L5.5 9l4.7-1.4z'
	},
	{
		id: 'settings',
		label: 'Einstellungen',
		href: '/settings',
		floor: 'technik',
		group: 'system',
		ready: true,
		capability: 'settings',
		blurb: 'Modelle, Aussehen, Sicherheit und Workspace-Optionen.',
		icon: 'M19.14 12.94a7.49 7.49 0 0 0 .05-.94 7.49 7.49 0 0 0-.05-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.61-.22l-2.39.96a7.3 7.3 0 0 0-1.62-.94l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.5.42l-.36 2.54c-.59.24-1.13.56-1.62.94l-2.39-.96a.5.5 0 0 0-.61.22L2.74 8.8a.5.5 0 0 0 .12.64l2.03 1.58c-.03.31-.05.62-.05.94s.02.63.05.94l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32a.5.5 0 0 0 .61.22l2.39-.96c.49.38 1.03.7 1.62.94l.36 2.54a.5.5 0 0 0 .5.42h3.84a.5.5 0 0 0 .5-.42l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96a.5.5 0 0 0 .61-.22l1.92-3.32a.5.5 0 0 0-.12-.64zM12 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z'
	}
];

// Alle Apps einer Etage in Definitions-Reihenfolge.
export function appsOnFloor(floor: Floor): AppDef[] {
	return APPS.filter((a) => a.floor === floor);
}
