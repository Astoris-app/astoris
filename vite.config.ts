import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { readFileSync, existsSync } from 'node:fs';

// HTTPS: aktiv, sobald Zertifikatsdateien vorhanden sind (vom Setup-Script erzeugt).
// Pfade über env überschreibbar. Ohne Zertifikate läuft der Server als HTTP.
const certPath = process.env.ASTORIS_CERT ?? 'certs/cert.pem';
const keyPath = process.env.ASTORIS_KEY ?? 'certs/key.pem';
const https =
	existsSync(certPath) && existsSync(keyPath)
		? { cert: readFileSync(certPath), key: readFileSync(keyPath) }
		: undefined;

export default defineConfig({
	server: {
		port: 5180,
		host: true,
		// Dev-Zugriff über Tailscale-/LAN-Hostnamen erlauben (sonst "Blocked request").
		allowedHosts: ['.ts.net', 'localhost'],
		https
	},
	preview: {
		host: true,
		allowedHosts: ['.ts.net', 'localhost'],
		https
	},
	plugins: [
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter: adapter()
		})
	]
});
