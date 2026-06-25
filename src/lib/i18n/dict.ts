// Zweisprachige Texte (DE/EN). Verschachtelte Keys, via i18n.t('apps.chat') abrufbar.
export const dict = {
	de: {
		apps: { chat: 'Assistent', mail: 'Posteingang', docs: 'Dokumente', research: 'Recherche', studio: 'Studio', calendar: 'Kalender', agents: 'Team', tresor: 'Tresor', connections: 'Verbindungen', settings: 'Einstellungen' },
		chat: { title: 'Assistent', eyebrow: 'Maschinenraum', newChat: 'Neuer Chat', placeholder: 'Nachricht an Astoris …', welcome: 'Womit fangen wir an?', welcomeSub: 'Dein Assistent läuft lokal und antwortet in Echtzeit.', history: 'Verlauf', noChats: 'Noch keine Gespräche.', persona: 'Persönlichkeit wählen' },
		settings: { title: 'Einstellungen', eyebrow: 'Astoris anpassen', appearance: 'Aussehen', accent: 'Akzentfarbe', fontSize: 'Schriftgröße', language: 'Sprache', model: 'KI-Modell', security: 'Sicherheit', logout: 'Abmelden', changePw: 'Passwort ändern', about: 'Über', compact: 'Kompakt', normal: 'Normal', large: 'Groß' },
		common: { save: 'Speichern', cancel: 'Abbrechen', delete: 'Löschen', connect: 'Verbinden', loading: 'Lädt …' }
	},
	en: {
		apps: { chat: 'Assistant', mail: 'Inbox', docs: 'Documents', research: 'Research', studio: 'Studio', calendar: 'Calendar', agents: 'Team', tresor: 'Vault', connections: 'Connections', settings: 'Settings' },
		chat: { title: 'Assistant', eyebrow: 'Engine room', newChat: 'New chat', placeholder: 'Message Astoris …', welcome: 'Where shall we begin?', welcomeSub: 'Your assistant runs locally and replies in real time.', history: 'History', noChats: 'No conversations yet.', persona: 'Choose personality' },
		settings: { title: 'Settings', eyebrow: 'Customize Astoris', appearance: 'Appearance', accent: 'Accent color', fontSize: 'Font size', language: 'Language', model: 'AI model', security: 'Security', logout: 'Sign out', changePw: 'Change password', about: 'About', compact: 'Compact', normal: 'Normal', large: 'Large' },
		common: { save: 'Save', cancel: 'Cancel', delete: 'Delete', connect: 'Connect', loading: 'Loading …' }
	}
} as const;

export type Lang = keyof typeof dict;
