import { json, error } from '@sveltejs/kit';
import {
	listPlugins, setPluginEnabled, setPluginLicensed, removePlugin,
	installConnectorPlugin, installCodePlugin, saveCodePlugin, getPlugin
} from '$lib/server/plugins';
import { runCodeAddon } from '$lib/server/sandbox';
import { getPluginConfigKeys, setPluginConfig, getPluginConfig } from '$lib/server/pluginConfig';

export async function GET({ url }) {
	const id = url.searchParams.get('id');
	if (id) {
		const p = getPlugin(id);
		if (!p) throw error(404, 'Add-on nicht gefunden.');
		return json({ plugin: p, configKeys: getPluginConfigKeys(id) });
	}
	return json({ plugins: listPlugins() });
}

export async function POST({ request }) {
	const b = await request.json().catch(() => ({}));
	const action = b?.action;

	if (action === 'toggle') {
		const ok = setPluginEnabled((b.id ?? '').toString(), Boolean(b.enabled));
		if (!ok) throw error(400, 'Add-on nicht gefunden oder Premium-Lizenz fehlt.');
		return json({ ok: true });
	}

	// Premium freischalten/sperren (Betreiber-Lizenz).
	if (action === 'license') {
		setPluginLicensed((b.id ?? '').toString(), Boolean(b.licensed));
		return json({ ok: true });
	}

	// Add-on-Config speichern (API-Keys etc.). secretKeys -> zusaetzlich in .env.
	if (action === 'set-config') {
		const cfg = (b.config && typeof b.config === 'object') ? b.config as Record<string, string> : {};
		const secretKeys = Array.isArray(b.secretKeys) ? b.secretKeys.map(String) : [];
		setPluginConfig((b.id ?? '').toString(), cfg, secretKeys);
		return json({ ok: true });
	}

	// Upload: Code-Add-on (type agent-tool + code) ODER Connector-Add-on (Daten)
	if (action === 'upload') {
		const m = b.manifest;
		try {
			const plugin = m?.type === 'agent-tool' && typeof m?.code === 'string'
				? installCodePlugin(m)
				: installConnectorPlugin(m);
			return json({ ok: true, plugin });
		} catch (e) {
			throw error(400, e instanceof Error ? e.message : 'Ungültiges Add-on.');
		}
	}

	// Code eines Add-ons im In-App-Editor speichern
	if (action === 'save-code') {
		const ok = saveCodePlugin((b.id ?? '').toString(), (b.code ?? '').toString());
		if (!ok) throw error(400, 'Code konnte nicht gespeichert werden.');
		return json({ ok: true });
	}

	// Code-Add-on testweise ausführen (Sandbox)
	if (action === 'run') {
		let code = typeof b.code === 'string' ? b.code : '';
		if (!code) {
			const p = getPlugin((b.id ?? '').toString()) as any;
			if (!p || p.type !== 'agent-tool' || typeof p.code !== 'string') throw error(404, 'Code-Add-on nicht gefunden.');
			code = p.code;
		}
		const res = await runCodeAddon(code, b.input, 5000);
		return json(res);
	}

	// Installiertes Add-on direkt ausführen (mit gespeicherter Config) — für Studio/Chat-Buttons.
	if (action === 'run-tool') {
		const id = (b.id ?? '').toString();
		const p = getPlugin(id) as { type?: string; code?: string; enabled?: boolean; premium?: boolean; licensed?: boolean } | null;
		if (!p || p.type !== 'agent-tool' || typeof p.code !== 'string') throw error(404, 'Add-on nicht gefunden.');
		if (!p.enabled) throw error(400, 'Add-on ist nicht aktiviert.');
		if (p.premium && !p.licensed) throw error(403, 'Premium-Add-on nicht freigeschaltet.');
		const config = getPluginConfig(id);
		const input = (b.input && typeof b.input === 'object') ? b.input : {};
		const res = await runCodeAddon(p.code, { ...config, ...input }, 8000);
		return json(res);
	}

	if (action === 'remove') {
		return json({ ok: removePlugin((b.id ?? '').toString()) });
	}

	throw error(400, 'Unbekannte Aktion.');
}
