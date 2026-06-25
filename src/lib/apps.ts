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
		ready: false,
		capability: 'email',
		blurb: 'E-Mails über alle Konten, KI-Triage und Antwort-Entwürfe — versendet wird nur auf Klick.',
		icon: 'M3.5 6.5h17v11h-17zM3.8 7l8.2 6 8.2-6'
	},
	{
		id: 'docs',
		label: 'Dokumente',
		href: '/docs',
		group: 'work',
		ready: false,
		capability: 'rag',
		blurb: 'Dein Wissensspeicher: Dokumente hochladen, durchsuchen, von der KI auswerten lassen.',
		icon: 'M6 3.5h7l5 5v12H6zM13 3.5V8.5h5M9 13h6M9 16.5h6'
	},
	{
		id: 'research',
		label: 'Recherche',
		href: '/research',
		group: 'work',
		ready: false,
		capability: 'web',
		blurb: 'Mehrstufige Web-Recherche mit Quellenprüfung und Bericht.',
		icon: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM16 16l4 4'
	},
	{
		id: 'studio',
		label: 'Studio',
		href: '/studio',
		group: 'work',
		ready: false,
		capability: 'image',
		blurb: 'Bilder erzeugen und analysieren — lokal mit FLUX und Vision-Modellen.',
		icon: 'M4 5.5h16v13H4zM4 15l4.5-4.5 4 4 3-3L20 15M9 9.5a1.2 1.2 0 1 0 0-.01'
	},
	{
		id: 'calendar',
		label: 'Kalender',
		href: '/calendar',
		group: 'work',
		ready: false,
		capability: 'calendar',
		blurb: 'Termine über verbundene Kalender — die KI plant, erinnert, koordiniert.',
		icon: 'M4.5 6h15v13.5h-15zM4.5 10h15M8 3.5v4M16 3.5v4'
	},
	{
		id: 'agents',
		label: 'Team',
		href: '/agents',
		group: 'work',
		ready: false,
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
		id: 'settings',
		label: 'Einstellungen',
		href: '/settings',
		group: 'system',
		ready: true,
		capability: 'settings',
		blurb: 'Modelle, Aussehen, Sicherheit und Workspace-Optionen.',
		icon: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM19.4 13.5a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7.7 1.6 1.6 0 0 0-1.1 1.5V20a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-2.8-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-1.1-2.7H2a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.1-2.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 2.7-1.1V2a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.8 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 .7 2.7'
	}
];
