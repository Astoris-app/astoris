// Erst-Einrichtungsstatus. data/setup.json existiert = Onboarding abgeschlossen.
import { existsSync, writeFileSync, mkdirSync } from 'node:fs';

const FILE = 'data/setup.json';

export function isSetupDone(): boolean {
	return existsSync(FILE);
}

export function markSetupDone(profile: string = 'personal') {
	mkdirSync('data', { recursive: true });
	writeFileSync(
		FILE,
		JSON.stringify({ done: true, profile, at: new Date().toISOString() }, null, 2)
	);
}
