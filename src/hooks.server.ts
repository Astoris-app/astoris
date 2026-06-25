import type { Handle } from '@sveltejs/kit';
import { redirect, json } from '@sveltejs/kit';
import { isSetupDone } from '$lib/server/setup';
import { getSession, tailscaleWhois, isTailscaleAllowed, authConfigured, createSession } from '$lib/server/auth';

const COOKIE = 'astoris_session';

export const handle: Handle = async ({ event, resolve }) => {
	const p = event.url.pathname;
	// Assets ungeprüft durchlassen (kein teures whois pro Datei)
	if (p.startsWith('/_app') || p.startsWith('/favicon') || p === '/robots.txt') {
		return resolve(event);
	}

	// Nutzer ermitteln: 1) Session-Cookie  2) Tailscale-Auto-Login
	let user: { name: string; method: string } | null = null;
	const sid = event.cookies.get(COOKIE);
	const sess = getSession(sid);
	if (sess) {
		user = { name: sess.user, method: sess.method };
	} else if (authConfigured()) {
		const ts = await tailscaleWhois(event.getClientAddress());
		if (ts && isTailscaleAllowed(ts.login)) {
			const fresh = createSession(ts.login, 'tailscale');
			event.cookies.set(COOKIE, fresh, {
				path: '/',
				httpOnly: true,
				sameSite: 'lax',
				secure: event.url.protocol === 'https:',
				maxAge: 60 * 60 * 24 * 30
			});
			user = { name: ts.login, method: 'tailscale' };
		}
	}
	event.locals.user = user;

	const isApi = p.startsWith('/api');
	const onWelcome = p.startsWith('/welcome');
	const onLogin = p.startsWith('/login');

	// API-Schutz: sobald Auth konfiguriert ist, brauchen geschützte API-Routen eine Sitzung.
	// Ausnahmen: Auth + Setup (vor dem Login nötig). Während des Onboardings (noch keine
	// Auth konfiguriert) bleiben die APIs offen, damit die Einrichtung funktioniert.
	const apiPublic = p.startsWith('/api/auth') || p.startsWith('/api/setup');
	if (isApi && !apiPublic && isSetupDone() && authConfigured() && !user) {
		return json({ error: 'Nicht angemeldet.' }, { status: 401 });
	}

	// 1) Erst-Einrichtung (Onboarding)
	if (!isSetupDone() && !onWelcome && !isApi) {
		throw redirect(303, '/welcome');
	}
	// 2) Anmeldung erforderlich (nach Onboarding), Seiten-Navigation schützen
	if (isSetupDone() && !user && !onLogin && !onWelcome && !isApi) {
		throw redirect(303, '/login');
	}

	return resolve(event);
};
