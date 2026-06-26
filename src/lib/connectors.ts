// Katalog der verbindbaren Konten. Was hier verbunden + erlaubt wird,
// darf die KI nutzen — und nur das. Berechtigungen sind opt-in.

export type Scope = { id: string; label: string; default: boolean; sensitive?: boolean };
export type Field = {
	key: string;
	label: string;
	type: 'text' | 'password' | 'url';
	placeholder?: string;
	optional?: boolean;
	hint?: string;
};

export type Connector = {
	id: string;
	name: string;
	category: 'Kommunikation' | 'Organisation' | 'Wissen & Dateien' | 'KI-Modelle' | 'Geschäft';
	blurb: string;
	icon: string; // SVG path
	fields: Field[];
	scopes: Scope[];
};

export const CONNECTORS: Connector[] = [
	{
		id: 'email',
		name: 'E-Mail',
		category: 'Kommunikation',
		blurb: 'IMAP/SMTP-Postfach. Triage, Zusammenfassungen, Antwort-Entwürfe.',
		icon: 'M3.5 6.5h17v11h-17zM3.8 7l8.2 6 8.2-6',
		fields: [
			{ key: 'email', label: 'E-Mail-Adresse', type: 'text', placeholder: 'name@firma.de' },
			{ key: 'imap_host', label: 'IMAP-Server', type: 'text', placeholder: 'imap.strato.de' },
			{ key: 'smtp_host', label: 'SMTP-Server', type: 'text', placeholder: 'smtp.strato.de' },
			{ key: 'password', label: 'Passwort', type: 'password' }
		],
		scopes: [
			{ id: 'read', label: 'E-Mails lesen & zusammenfassen', default: true },
			{ id: 'draft', label: 'Antworten entwerfen', default: true },
			{ id: 'send', label: 'Selbstständig senden', default: false, sensitive: true }
		]
	},
	{
		id: 'calendar',
		name: 'Google Kalender',
		category: 'Organisation',
		blurb: 'Termine lesen, planen und Erinnerungen setzen.',
		icon: 'M4.5 6h15v13.5h-15zM4.5 10h15M8 3.5v4M16 3.5v4',
		fields: [{ key: 'account', label: 'Google-Konto', type: 'text', placeholder: 'name@gmail.com' }],
		scopes: [
			{ id: 'read', label: 'Termine lesen', default: true },
			{ id: 'write', label: 'Termine anlegen & ändern', default: false, sensitive: true }
		]
	},
	{
		id: 'trello',
		name: 'Trello',
		category: 'Organisation',
		blurb: 'Boards und Karten verwalten, Aufgaben automatisch pflegen.',
		icon: 'M4 4.5h16v15H4zM8 8h3v8H8zM13 8h3v5h-3z',
		fields: [
			{ key: 'api_key', label: 'API-Key', type: 'password' },
			{ key: 'token', label: 'Token', type: 'password' }
		],
		scopes: [
			{ id: 'read', label: 'Boards lesen', default: true },
			{ id: 'write', label: 'Karten anlegen & verschieben', default: true }
		]
	},
	{
		id: 'telegram',
		name: 'Telegram',
		category: 'Kommunikation',
		blurb: 'Benachrichtigungen und Chat mit deinem Assistenten unterwegs.',
		icon: 'M21 4 3 11l5 2 2 6 3-4 5 4z',
		fields: [{ key: 'bot_token', label: 'Bot-Token', type: 'password' }],
		scopes: [{ id: 'notify', label: 'Benachrichtigungen senden', default: true }]
	},
	{
		id: 'slack',
		name: 'Slack',
		category: 'Kommunikation',
		blurb: 'Verschlüsselte Nachrichten über einen Slack-Bot in deine Channels.',
		icon: 'M4 4h16v12H7l-3 3z',
		fields: [{ key: 'bot_token', label: 'Bot-Token (xoxb-…)', type: 'password' }],
		scopes: [{ id: 'send', label: 'Nachrichten senden', default: true }]
	},
	{
		id: 'discord',
		name: 'Discord',
		category: 'Kommunikation',
		blurb: 'Verschlüsselte Nachrichten über einen Discord-Bot in deine Channels.',
		icon: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM9 11a1 1 0 1 1 0 2 1 1 0 0 1 0-2zm6 0a1 1 0 1 1 0 2 1 1 0 0 1 0-2z',
		fields: [{ key: 'bot_token', label: 'Bot-Token', type: 'password' }],
		scopes: [{ id: 'send', label: 'Nachrichten senden', default: true }]
	},
	{
		id: 'cloud-ai',
		name: 'Cloud-KI',
		category: 'KI-Modelle',
		blurb: 'Claude oder OpenAI als Modell-Anbieter — wenn keine lokale GPU da ist.',
		icon: 'M7 18a5 5 0 0 1-1-9.9A6 6 0 0 1 18 8.5 4.5 4.5 0 0 1 17.5 18z',
		fields: [
			{ key: 'provider', label: 'Anbieter', type: 'text', placeholder: 'anthropic / openai' },
			{ key: 'api_key', label: 'API-Schlüssel', type: 'password' }
		],
		scopes: [{ id: 'use', label: 'Als Modell verwenden', default: true }]
	},
	{
		id: 'local-models',
		name: 'Lokale Modelle',
		category: 'KI-Modelle',
		blurb: 'Eigene vLLM-/Ollama-Modelle auf deiner Hardware — volle Souveränität.',
		icon: 'M5 5h14v6H5zM5 13h14v6H5zM8 8h.01M8 16h.01',
		fields: [
			{ key: 'base_url', label: 'Endpoint', type: 'url', placeholder: 'http://localhost:8000' },
			{
				key: 'api_key',
				label: 'API-Schlüssel',
				type: 'password',
				optional: true,
				hint: 'Nur falls dein Server einen Schlüssel verlangt (vLLM/Ollama meist ohne).'
			}
		],
		scopes: [{ id: 'use', label: 'Als Modell verwenden', default: true }]
	},
	{
		id: 'files',
		name: 'Dateien (Nextcloud/WebDAV)',
		category: 'Wissen & Dateien',
		blurb: 'Dokumente bereitstellen, durchsuchen und auswerten lassen.',
		icon: 'M4 7.5l3-3h4l2 2h7v11H4zM4 11h16',
		fields: [
			{ key: 'url', label: 'WebDAV-URL', type: 'url' },
			{ key: 'user', label: 'Benutzer', type: 'text' },
			{ key: 'password', label: 'Passwort', type: 'password' }
		],
		scopes: [
			{ id: 'read', label: 'Dateien lesen', default: true },
			{ id: 'write', label: 'Dateien speichern', default: false, sensitive: true }
		]
	},
	{
		id: 'stripe',
		name: 'Stripe',
		category: 'Geschäft',
		blurb: 'Zahlungen und Rechnungen für deine Firmen-Workflows.',
		icon: 'M4 8.5h16M4 13h16M7 16.5h5',
		fields: [{ key: 'secret_key', label: 'Secret Key', type: 'password' }],
		scopes: [
			{ id: 'read', label: 'Zahlungen lesen', default: true },
			{ id: 'charge', label: 'Zahlungen auslösen', default: false, sensitive: true }
		]
	}
];
