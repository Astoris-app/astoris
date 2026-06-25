// Authentifizierung fuer Astoris (Tailscale-Erkennung + lokaler Zugangsschutz).
// Sessions als signierte Tokens in data/sessions.json. Keine externen Dienste.

import { scryptSync, randomBytes, timingSafeEqual } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const execFileP = promisify(execFile);
const AUTH_FILE = 'data/auth.json';
const SESS_FILE = 'data/sessions.json';
const DAY = 86_400_000;

type AuthConfig = {
	username?: string;
	pwHash?: string;
	pwSalt?: string;
	tailscaleAllow: string[];
	allowAnyTailnet: boolean;
};
type Session = { user: string; method: 'password' | 'tailscale'; expires: number };

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
	const value = randomBytes(32).toString('hex');
	const sessions = readJson<Record<string, Session>>(SESS_FILE, {});
	sessions[value] = { user, method, expires: Date.now() + 30 * DAY };
	writeJson(SESS_FILE, sessions);
	return value;
}
export function getSession(token: string | undefined): { user: string; method: string } | null {
	if (!token) return null;
	const sessions = readJson<Record<string, Session>>(SESS_FILE, {});
	const s = sessions[token];
	if (!s) return null;
	if (s.expires < Date.now()) {
		delete sessions[token];
		writeJson(SESS_FILE, sessions);
		return null;
	}
	return { user: s.user, method: s.method };
}
export function deleteSession(token: string | undefined) {
	if (!token) return;
	const sessions = readJson<Record<string, Session>>(SESS_FILE, {});
	if (sessions[token]) {
		delete sessions[token];
		writeJson(SESS_FILE, sessions);
	}
}
