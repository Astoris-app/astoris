// API des Selbst-Erweiterungs-Systems (Kurator). Session-geschützt über hooks.server.ts.
// Aktionen: develop (neue Runde), decide (allow/deny), rollback, loop (Not-Aus an/aus).
// Nichts wird ohne ausdrücklichen Operator-Klick installiert — Approval-Gate ist hart.

import { json, error } from '@sveltejs/kit';
import { runOnce } from '$lib/server/curator';
import {
	listProposals, getProposal, setProposalStatus, setProposalAddonId, installedAddonIds
} from '$lib/server/proposals';
import { getConstitution, setLoopEnabled } from '$lib/server/constitution';
import { listAudit, appendAudit } from '$lib/server/audit';
import { installCodePlugin, setPluginEnabled, removePlugin, getPlugin } from '$lib/server/plugins';
import { getActiveId } from '$lib/server/companies';

export function GET() {
	const c = getConstitution();
	return json({
		proposals: listProposals(),
		loopEnabled: c.loopEnabled,
		budgets: c.budgets,
		installedCount: installedAddonIds().length,
		audit: listAudit(40)
	});
}

// Freie, kollisionsfreie Add-on-id ableiten (hängt -2, -3 … an, falls schon vergeben).
function uniqueAddonId(base: string): string {
	if (!getPlugin(base)) return base;
	for (let n = 2; n < 100; n++) {
		const cand = `${base}-${n}`.slice(0, 40);
		if (!getPlugin(cand)) return cand;
	}
	return `${base}-${Date.now()}`.slice(0, 40);
}

export async function POST({ request, locals }) {
	const actor = locals.user?.name || 'operator';
	const b = await request.json().catch(() => ({}));
	const action = b?.action;

	// Neue Kurator-Runde: erkennt eine Lücke, baut + testet ein Add-on, legt einen Vorschlag ab.
	if (action === 'develop') {
		const res = await runOnce();
		if (!res.ok) return json({ ok: false, message: res.message });
		return json({ ok: true, proposal: res.proposal });
	}

	// Operator-Entscheidung zu einem Vorschlag.
	if (action === 'decide') {
		const id = (b.id ?? '').toString();
		const decision = (b.decision ?? '').toString();
		const reason = (b.reason ?? '').toString();
		const p = getProposal(id);
		if (!p) throw error(404, 'Vorschlag nicht gefunden.');
		if (p.status !== 'vorgeschlagen') throw error(400, 'Über diesen Vorschlag wurde bereits entschieden.');

		if (decision === 'deny') {
			setProposalStatus(id, 'abgelehnt', { decidedBy: actor, reason });
			appendAudit({ action: 'proposal-rejected', actor, companyId: getActiveId(), targetId: id, detail: p.title, result: reason || undefined });
			return json({ ok: true });
		}

		if (decision === 'allow') {
			const installId = uniqueAddonId(p.addon.id);
			const manifest = {
				id: installId,
				name: p.addon.name,
				version: '1.0.0',
				type: 'agent-tool',
				code: p.addon.code,
				description: p.addon.description,
				inputHint: p.addon.inputHint,
				author: 'Kurator (KI)'
			};
			try {
				installCodePlugin(manifest);
				setPluginEnabled(installId, true);
			} catch (e) {
				throw error(400, e instanceof Error ? e.message : 'Installation fehlgeschlagen.');
			}
			if (installId !== p.addon.id) setProposalAddonId(id, installId);
			setProposalStatus(id, 'installiert', { decidedBy: actor, reason });
			appendAudit({ action: 'proposal-approved', actor, companyId: getActiveId(), targetId: id, detail: p.title });
			appendAudit({ action: 'proposal-installed', actor, companyId: getActiveId(), targetId: id, detail: installId });
			return json({ ok: true, addonId: installId });
		}

		throw error(400, 'Ungültige Entscheidung.');
	}

	// Rollback eines installierten Vorschlags: Add-on entfernen, Status zurücksetzen.
	if (action === 'rollback') {
		const id = (b.id ?? '').toString();
		const p = getProposal(id);
		if (!p) throw error(404, 'Vorschlag nicht gefunden.');
		if (p.status !== 'installiert') throw error(400, 'Nur installierte Vorschläge lassen sich zurückrollen.');
		removePlugin(p.addon.id);
		setProposalStatus(id, 'zurückgerollt', { decidedBy: actor });
		appendAudit({ action: 'proposal-rolled-back', actor, companyId: getActiveId(), targetId: id, detail: p.addon.id });
		return json({ ok: true });
	}

	// Not-Aus / Loop-Schalter. stop=true schaltet zusätzlich ALLE selbst-installierten Add-ons ab.
	if (action === 'loop') {
		const enabled = Boolean(b.enabled);
		setLoopEnabled(enabled);
		if (!enabled && b.detonate) {
			for (const aid of installedAddonIds()) setPluginEnabled(aid, false);
			appendAudit({ action: 'emergency-stop', actor, detail: 'Loop gestoppt + alle selbst-installierten Add-ons deaktiviert.' });
		} else {
			appendAudit({ action: enabled ? 'loop-resumed' : 'loop-stopped', actor });
		}
		return json({ ok: true, loopEnabled: enabled });
	}

	throw error(400, 'Unbekannte Aktion.');
}
