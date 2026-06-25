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
