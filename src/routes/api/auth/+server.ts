import { json } from '@sveltejs/kit';
import {
	hasPassword, getUsername, setCredentials, verifyCredentials,
	allowTailscaleUser, isTailscaleAllowed, tailscaleWhois,
	authConfigured, createSession, deleteSession
} from '$lib/server/auth';

const COOKIE = 'astoris_session';

function setCookie(cookies: any, value: string, https: boolean) {
	cookies.set(COOKIE, value, {
		path: '/', httpOnly: true, sameSite: 'lax', secure: https, maxAge: 60 * 60 * 24 * 30
	});
}

export async function GET({ locals, getClientAddress }) {
	const ts = await tailscaleWhois(getClientAddress());
	const pwSet = hasPassword();
	return json({
		user: locals.user,
		configured: authConfigured(),
		passwordSet: pwSet,
		username: getUsername(),
		tailscale: ts ? { login: ts.login, name: ts.name, allowed: isTailscaleAllowed(ts.login) } : null
	});
}

export async function POST({ request, cookies, url, getClientAddress, locals }) {
	const body = await request.json().catch(() => ({}));
	const action = body?.action;
	const https = url.protocol === 'https:';
	const username = (body?.username ?? '').toString().trim();
	const pw = (body?.password ?? '').toString();

	// Erst-Einrichtung: Benutzer + Passwort festlegen
	if (action === 'set-password') {
		if (authConfigured()) return json({ ok: false, error: 'Bereits eingerichtet.' }, { status: 400 });
		if (username.length < 3) return json({ ok: false, error: 'Benutzername: mindestens 3 Zeichen.' }, { status: 400 });
		if (pw.length < 8) return json({ ok: false, error: 'Passwort: mindestens 8 Zeichen.' }, { status: 400 });
		setCredentials(username, pw);
		setCookie(cookies, createSession(username, 'password'), https);
		return json({ ok: true });
	}

	// Anmeldung: Benutzername + Passwort
	if (action === 'login') {
		if (!verifyCredentials(username, pw)) return json({ ok: false, error: 'Benutzername oder Passwort falsch.' }, { status: 401 });
		setCookie(cookies, createSession(username, 'password'), https);
		return json({ ok: true });
	}

	// Tailscale-Freischaltung/Anmeldung
	if (action === 'tailscale') {
		const ts = await tailscaleWhois(getClientAddress());
		if (!ts) return json({ ok: false, error: 'Keine Tailscale-Identität erkannt.' }, { status: 400 });
		if (!authConfigured() || isTailscaleAllowed(ts.login)) {
			allowTailscaleUser(ts.login);
			setCookie(cookies, createSession(ts.login, 'tailscale'), https);
			return json({ ok: true, login: ts.login });
		}
		return json({ ok: false, error: 'Dieser Tailscale-Nutzer ist nicht freigegeben.' }, { status: 403 });
	}

	// Passwort ändern (eingeloggt)
	if (action === 'change-password') {
		if (!locals.user) return json({ ok: false, error: 'Nicht angemeldet.' }, { status: 401 });
		const user = getUsername() ?? locals.user.name;
		const oldPw = (body?.oldPassword ?? '').toString();
		const newPw = (body?.newPassword ?? '').toString();
		if (!verifyCredentials(user, oldPw)) return json({ ok: false, error: 'Aktuelles Passwort falsch.' }, { status: 401 });
		if (newPw.length < 8) return json({ ok: false, error: 'Neues Passwort: mindestens 8 Zeichen.' }, { status: 400 });
		setCredentials(user, newPw);
		return json({ ok: true });
	}

	if (action === 'logout') {
		deleteSession(cookies.get(COOKIE));
		cookies.delete(COOKIE, { path: '/' });
		return json({ ok: true });
	}

	return json({ ok: false, error: 'Unbekannte Aktion.' }, { status: 400 });
}
