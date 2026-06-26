// Astoris — App-Registry. Jede App ist ein Bereich des Workspace.
// `icon` ist SVG-Path-Data (24×24, stroke-basiert), gerendert in <Icon>.

export type AppDef = {
	id: string;
	label: string;
	href: string;
	icon: string;
	group: 'work' | 'system';
	/** Kurzbeschreibung für leere Zustände / Tooltips */
	blurb: string;
	/** Welche Engine-Fähigkeit dahinterliegt (für Status/Plugin-Logik) */
	capability: string;
	ready: boolean;
};

export const APPS: AppDef[] = [
	{
		id: 'firma',
		label: 'Cockpit',
		href: '/firma',
		group: 'work',
		ready: true,
		capability: 'agents',
		blurb: 'Wo steht deine Firma? Ziele, Fortschritt, Agenten-Aktivität und Handlungsbedarf auf einen Blick.',
		icon: 'M4 4h7v7H4zM13 4h7v5h-7zM13 11h7v9h-7zM4 13h7v7H4z'
	},
	{
		id: 'chat',
		label: 'Assistent',
		href: '/',
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
		group: 'work',
		ready: true,
		capability: 'email',
		blurb: 'E-Mails über alle Konten, KI-Triage und Antwort-Entwürfe — versendet wird nur auf Klick.',
		icon: 'M3.5 6.5h17v11h-17zM3.8 7l8.2 6 8.2-6'
	},
	{
		id: 'docs',
		label: 'Dokumente',
		href: '/docs',
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
		group: 'work',
		ready: true,
		capability: 'calendar',
		blurb: 'Termine über verbundene Kalender — die KI plant, erinnert, koordiniert.',
		icon: 'M4.5 6h15v13.5h-15zM4.5 10h15M8 3.5v4M16 3.5v4'
	},
	{
		id: 'agents',
		label: 'Team',
		href: '/agents',
		group: 'work',
		ready: true,
		capability: 'agents',
		blurb: 'Mehrere KI-Agenten arbeiten an Aufgaben zusammen — du behältst die Kontrolle.',
		icon: 'M12 3.5a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM5 20a4 4 0 0 1 14 0M5.5 11.5a2.2 2.2 0 1 0 0-.01M18.5 11.5a2.2 2.2 0 1 0 0-.01'
	},
	{
		id: 'tresor',
		label: 'Tresor',
		href: '/tresor',
		group: 'work',
		ready: true,
		capability: 'crypto',
		blurb: 'Nachrichten & Dateien Ende-zu-Ende verschlüsseln und sicher versenden.',
		icon: 'M6 10V8a6 6 0 0 1 12 0v2M5 10h14v10H5zM12 14v3'
	},
	{
		id: 'connections',
		label: 'Verbindungen',
		href: '/connections',
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
		group: 'system',
		ready: true,
		capability: 'plugins',
		blurb: 'Add-ons installieren und verwalten — erweitere Astoris.',
		icon: 'M4 8V5a1 1 0 0 1 1-1h3a2 2 0 1 1 4 0h3a1 1 0 0 1 1 1v3a2 2 0 1 0 0 4v3a1 1 0 0 1-1 1h-3a2 2 0 1 0-4 0H5a1 1 0 0 1-1-1v-3a2 2 0 1 1 0-4z'
	},
	{
		id: 'settings',
		label: 'Einstellungen',
		href: '/settings',
		group: 'system',
		ready: true,
		capability: 'settings',
		blurb: 'Modelle, Aussehen, Sicherheit und Workspace-Optionen.',
		icon: 'M19.14 12.94a7.49 7.49 0 0 0 .05-.94 7.49 7.49 0 0 0-.05-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.61-.22l-2.39.96a7.3 7.3 0 0 0-1.62-.94l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.5.42l-.36 2.54c-.59.24-1.13.56-1.62.94l-2.39-.96a.5.5 0 0 0-.61.22L2.74 8.8a.5.5 0 0 0 .12.64l2.03 1.58c-.03.31-.05.62-.05.94s.02.63.05.94l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32a.5.5 0 0 0 .61.22l2.39-.96c.49.38 1.03.7 1.62.94l.36 2.54a.5.5 0 0 0 .5.42h3.84a.5.5 0 0 0 .5-.42l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96a.5.5 0 0 0 .61-.22l1.92-3.32a.5.5 0 0 0-.12-.64zM12 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z'
	}
];
