// Authentifizierung fuer Astoris (Tailscale-Erkennung + lokaler Zugangsschutz).
// Sessions als signierte Tokens in data/sessions.json. Keine externen Dienste.

import { scryptSync, randomBytes, timingSafeEqual } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { runtimeStore } from './runtime';
import { SessionStore, type Session } from './runtime/sessions';
import { encrypt, decrypt } from './crypto';

const execFileP = promisify(execFile);
const AUTH_FILE = 'data/auth.json';
const SESS_FILE = 'data/sessions.json';

type AuthConfig = {
	username?: string;
	pwHash?: string;
	pwSalt?: string;
	tailscaleAllow: string[];
	allowAnyTailnet: boolean;
};

let sessionStore: SessionStore | undefined;
function sessions(): SessionStore {
	if (!sessionStore) {
		const store = new SessionStore(runtimeStore().db, { encrypt, decrypt });
		store.migrateLegacy(() => {
			if (!existsSync(SESS_FILE)) return {};
			const raw = JSON.parse(readFileSync(SESS_FILE, 'utf8'));
			if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Ungültiger Legacy-Sitzungsspeicher.');
			return raw as Record<string, Session>;
		});
		sessionStore = store;
	}
	return sessionStore;
}

function readJson<T>(file: string, fallback: T): T {
	if (!existsSync(file)) return fallback;
	try { return JSON.parse(readFileSync(file, 'utf8')) as T; } catch { return fallback; }
}
function writeJson(file: string, data: unknown) {
	mkdirSync('data', { recursive: true });
	writeFileSync(file, JSON.stringify(data, null, 2), { mode: 0o600 });
}

function loadAuth(): AuthConfig {
	return readJson<AuthConfig>(AUTH_FILE, { tailscaleAllow: [], allowAnyTailnet: false });
}

// ---- Passwort ----
export function hasPassword(): boolean {
	const a = loadAuth();
	return Boolean(a.pwHash && a.pwSalt);
}
export function getUsername(): string | null {
	return loadAuth().username ?? null;
}
export function setCredentials(username: string, pw: string) {
	const salt = randomBytes(16).toString('hex');
	const hash = scryptSync(pw, salt, 64).toString('hex');
	const a = loadAuth();
	a.username = username;
	a.pwHash = hash;
	a.pwSalt = salt;
	writeJson(AUTH_FILE, a);
}
export function verifyCredentials(username: string, pw: string): boolean {
	const a = loadAuth();
	if (!a.pwHash || !a.pwSalt || !a.username) return false;
	if (username !== a.username) return false;
	const h = scryptSync(pw, a.pwSalt, 64);
	const stored = Buffer.from(a.pwHash, 'hex');
	return h.length === stored.length && timingSafeEqual(h, stored);
}

// ---- Tailscale ----
export function allowTailscaleUser(login: string) {
	const a = loadAuth();
	if (!a.tailscaleAllow.includes(login)) a.tailscaleAllow.push(login);
	writeJson(AUTH_FILE, a);
}
export function isTailscaleAllowed(login: string): boolean {
	const a = loadAuth();
	return a.allowAnyTailnet || a.tailscaleAllow.includes(login);
}
export async function tailscaleWhois(ip: string): Promise<{ login: string; name: string } | null> {
	if (!ip || ip === '127.0.0.1' || ip === '::1') return null;
	try {
		const { stdout } = await execFileP('tailscale', ['whois', '--json', ip], { timeout: 3000 });
		const d = JSON.parse(stdout);
		const up = d?.UserProfile;
		if (up?.LoginName) return { login: up.LoginName, name: up.DisplayName || up.LoginName };
		return null;
	} catch {
		return null;
	}
}

// ---- Auth-Status ----
/** Auth gilt als konfiguriert, sobald ein Passwort ODER eine Tailscale-Freigabe existiert. */
export function authConfigured(): boolean {
	const a = loadAuth();
	return hasPassword() || a.allowAnyTailnet || a.tailscaleAllow.length > 0;
}

// ---- Sessions ----
export function createSession(user: string, method: 'password' | 'tailscale'): string {
	return sessions().create(user, method);
}
export function getSession(token: string | undefined): { user: string; method: string } | null {
	if (!token) return null;
	const s = sessions().get(token);
	if (!s) return null;
	return { user: s.user, method: s.method };
}
export function deleteSession(token: string | undefined) {
	if (!token) return;
	sessions().delete(token);
}

// ---- Brute-Force-Schutz (In-Memory, pro IP) ----

/** Prüft, ob für diesen Schlüssel (z. B. IP) noch Versuche erlaubt sind. */
export function loginAllowed(keyId: string): { allowed: boolean; retryAfter: number } {
	return sessions().allowed(keyId);
}
export function recordFailure(keyId: string) {
	sessions().failure(keyId);
}
export function clearFailures(keyId: string) {
	sessions().clear(keyId);
}

/** Alle Sitzungen eines Nutzers beenden (z. B. nach Passwort-Wechsel). */
export function deleteUserSessions(user: string) {
	sessions().deleteUser(user);
}
