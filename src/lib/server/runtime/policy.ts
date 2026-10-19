export type ToolRisk = 'read' | 'draft' | 'write' | 'external';
export function toolRisk(name: string): ToolRisk {
	if (name === 'calendar_list') return 'read';
	if (['mail_send', 'messenger_send', 'addon_erstellen'].includes(name)) return 'draft';
	if (['calendar_create', 'calendar_update', 'calendar_delete'].includes(name)) return 'write';
	// Add-on code can perform arbitrary external requests; descriptions cannot lower its risk.
	return 'external';
}
export function toolDecision(name: string, allowed: ReadonlySet<string>, autonomy: number) {
	const risk = toolRisk(name);
	if (!allowed.has(name)) return { allowed: false, approval: false, risk, reason: 'Dieses Werkzeug wurde dem Modell nicht freigegeben.' };
	if (risk === 'read' || risk === 'draft') return { allowed: true, approval: false, risk, reason: 'Lesen oder Entwurf ohne externe Änderung.' };
	const approval = risk === 'external' || autonomy < 4 || name === 'calendar_delete';
	return { allowed: true, approval, risk,
		reason: risk === 'external' ? 'Externes Werkzeug kann Daten lesen oder verändern; konkrete Eingabe bestätigen.' : approval ? 'Änderung benötigt die Freigabe des Betreibers.' : 'Kalender-Änderung im freigegebenen Autonomie-Bereich.' };
}
