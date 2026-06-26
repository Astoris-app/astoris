// Astoris Plugin-System — gemeinsame Typen (Client + Server).
export type PluginType = 'connector' | 'agent-tool' | 'app';

export type PluginManifest = {
	id: string;
	name: string;
	version: string;
	type: PluginType;
	author?: string;
	premium?: boolean;
	description?: string;
	icon?: string; // SVG-Path
	/** vom Loader gesetzt: ist das Add-on aktiviert? */
	enabled?: boolean;
	/** vom Loader gesetzt: ist ein Premium-Add-on freigeschaltet? */
	licensed?: boolean;
};

// --- Connector-Add-ons (daten-getrieben, per Upload installierbar) ---
export type PluginField = { key: string; label: string; type: 'text' | 'password' | 'url'; placeholder?: string; optional?: boolean; hint?: string };
export type PluginScope = { id: string; label: string; default: boolean; sensitive?: boolean };
export type ConnectorTest = { kind: 'http' | 'none'; path?: string; okStatus?: number; auth?: 'bearer' | 'basic' | 'none' };
export type ConnectorManifest = PluginManifest & {
	type: 'connector';
	fields: PluginField[];
	scopes: PluginScope[];
	test?: ConnectorTest;
};

// --- Code-Add-ons (ausführbarer Code, in-App editierbar) ---
export type CodeManifest = PluginManifest & {
	type: 'agent-tool';
	/** JS-Quelltext, definiert: async function run(input) { ... return ...; } */
	code: string;
	/** Hinweis für die KI/den Nutzer, was als Eingabe erwartet wird. */
	inputHint?: string;
	/** Optionale Einstellungs-Felder (z. B. API-Keys), im Editor pflegbar; password-Felder werden in die .env gespiegelt. */
	configFields?: PluginField[];
};
