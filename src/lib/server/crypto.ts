// AES-256-GCM Verschlüsselung für Verbindungs-Zugangsdaten ("Secrets at rest").
// Master-Key: bevorzugt aus env, sonst einmalig generiert und unter data/.master.key
// (chmod 600) abgelegt. Der Schlüssel verlässt niemals den Server.

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync, chmodSync } from 'node:fs';
import { dirname } from 'node:path';
import { env } from '$env/dynamic/private';

const KEY_FILE = 'data/.master.key';

function loadKey(): Buffer {
	const fromEnv = env['ASTORIS_' + 'MASTER_KEY'];
	if (fromEnv && fromEnv.length >= 64) return Buffer.from(fromEnv.slice(0, 64), 'hex');
	if (existsSync(KEY_FILE)) return Buffer.from(readFileSync(KEY_FILE, 'utf8').trim(), 'hex');
	const key = randomBytes(32);
	mkdirSync(dirname(KEY_FILE), { recursive: true });
	writeFileSync(KEY_FILE, key.toString('hex'), { mode: 0o600 });
	try { chmodSync(KEY_FILE, 0o600); } catch { /* best effort */ }
	return key;
}

const KEY = loadKey();

/** Verschlüsselt Klartext → base64(iv|tag|ciphertext). */
export function encrypt(plain: string): string {
	const iv = randomBytes(12);
	const cipher = createCipheriv('aes-256-gcm', KEY, iv);
	const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
	const tag = cipher.getAuthTag();
	return Buffer.concat([iv, tag, ct]).toString('base64');
}

/** Entschlüsselt base64(iv|tag|ciphertext) → Klartext. Wirft bei Manipulation. */
export function decrypt(blob: string): string {
	const buf = Buffer.from(blob, 'base64');
	const iv = buf.subarray(0, 12);
	const tag = buf.subarray(12, 28);
	const ct = buf.subarray(28);
	const d = createDecipheriv('aes-256-gcm', KEY, iv);
	d.setAuthTag(tag);
	return Buffer.concat([d.update(ct), d.final()]).toString('utf8');
}
