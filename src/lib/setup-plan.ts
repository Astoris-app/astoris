/** Shared, deliberately narrow configuration contract. No credentials or code. */
export type SetupPlan = {
	summary: string;
	profile: { name: string; industry: string; mission: string };
	roles: { title: string; description: string }[];
	goals: { title: string; description: string }[];
	connectors: string[];
};
export type SetupDraft = { id: string; owner: string; companyId: string; baseVersion: number;
	status: 'draft' | 'applied' | 'rejected'; createdAt: string; expiresAt: string; plan: SetupPlan };
export const AGENT_SCOPES = ['setup:read', 'setup:propose', 'runs:read', 'runs:create'] as const;
export type AgentScope = typeof AGENT_SCOPES[number];

function object(value: unknown, keys: string[]): Record<string, unknown> {
	if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some((k) => !keys.includes(k))) {
		throw new Error('Ungültige Planstruktur / invalid plan structure.');
	}
	return value as Record<string, unknown>;
}
function text(value: unknown, max: number, required = true): string {
	if (typeof value !== 'string' || value.length > max || (required && !value.trim()) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) {
		throw new Error('Ungültiges Textfeld / invalid text field.');
	}
	return value.trim();
}
export function validateSetupPlan(value: unknown, connectors: readonly string[]): SetupPlan {
	const root = object(value, ['summary', 'profile', 'roles', 'goals', 'connectors']);
	const profile = object(root.profile, ['name', 'industry', 'mission']);
	function items(value: unknown, max: number) {
		if (!Array.isArray(value) || value.length > max) throw new Error('Zu viele Einträge / too many entries.');
		const seen = new Set<string>();
		return value.map((entry) => {
			const row = object(entry, ['title', 'description']);
			const title = text(row.title, 140);
			if (seen.has(title.toLowerCase())) throw new Error('Doppelter Eintrag / duplicate entry.');
			seen.add(title.toLowerCase());
			return { title, description: text(row.description, 700, false) };
		});
	}
	if (!Array.isArray(root.connectors) || root.connectors.length > 8 || root.connectors.some((c) => typeof c !== 'string' || !connectors.includes(c))) {
		throw new Error('Unbekannte Verbindung / unknown connector.');
	}
	return { summary: text(root.summary, 1500), profile: { name: text(profile.name, 120),
		industry: text(profile.industry, 120, false), mission: text(profile.mission, 2000, false) },
		roles: items(root.roles, 8), goals: items(root.goals, 6), connectors: [...new Set(root.connectors)] };
}
