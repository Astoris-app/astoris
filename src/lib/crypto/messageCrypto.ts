// Client-seitige Ende-zu-Ende-Verschlüsselung (Web Crypto API, Zero-Knowledge).
// Format-kompatibel zur AES256CHAT-App: AES-256-GCM, PBKDF2-SHA512 (100k),
// Container = salt(32) + iv(12) + ciphertext(+tag), Base64, Marker-Präfix.
// Braucht Secure Context (HTTPS/localhost).

const MARKER = '🛡️QR-ENC:';
const FILE_MARKER = '🛡️QR-FILE:';
const ITERATIONS = 100_000;
const enc = new TextEncoder();
const dec = new TextDecoder();

function toBase64(bytes: Uint8Array): string {
	let bin = '';
	const chunk = 0x8000;
	for (let i = 0; i < bytes.length; i += chunk) {
		bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
	}
	return btoa(bin);
}
function fromBase64(b64: string): Uint8Array {
	const bin = atob(b64);
	const out = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
	return out;
}

function assertCrypto() {
	if (typeof crypto === 'undefined' || !crypto.subtle) {
		throw new Error('Verschlüsselung braucht HTTPS (Secure Context). Bitte über https:// öffnen.');
	}
}

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
	const material = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
	return crypto.subtle.deriveKey(
		{ name: 'PBKDF2', salt: salt as BufferSource, iterations: ITERATIONS, hash: 'SHA-512' },
		material,
		{ name: 'AES-GCM', length: 256 },
		false,
		['encrypt', 'decrypt']
	);
}

/** Verschlüsselt Text → "🛡️QR-ENC:<base64>". */
export async function encryptMessage(text: string, password: string): Promise<string> {
	assertCrypto();
	if (!password) throw new Error('Passphrase fehlt.');
	const salt = crypto.getRandomValues(new Uint8Array(32));
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const key = await deriveKey(password, salt);
	const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource, tagLength: 128 }, key, enc.encode(text));
	const ctBytes = new Uint8Array(ct);
	const out = new Uint8Array(salt.length + iv.length + ctBytes.length);
	out.set(salt, 0);
	out.set(iv, 32);
	out.set(ctBytes, 44);
	return MARKER + toBase64(out);
}

/** Entschlüsselt "🛡️QR-ENC:<base64>" → Text. */
export async function decryptMessage(payload: string, password: string): Promise<string> {
	assertCrypto();
	const clean = payload.trim().replace(MARKER, '').trim();
	const combined = fromBase64(clean);
	const salt = combined.slice(0, 32);
	const iv = combined.slice(32, 44);
	const data = combined.slice(44);
	const key = await deriveKey(password, salt);
	const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv as BufferSource, tagLength: 128 }, key, data as BufferSource);
	return dec.decode(pt);
}

export type EncryptedFile = { marker: string; name: string; type: string };

/** Verschlüsselt eine Datei → Base64-Block (mit Datei-Metadaten im Container). */
export async function encryptFile(file: File, password: string): Promise<string> {
	assertCrypto();
	if (!password) throw new Error('Passphrase fehlt.');
	const salt = crypto.getRandomValues(new Uint8Array(32));
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const key = await deriveKey(password, salt);
	const meta = enc.encode(JSON.stringify({ name: file.name, type: file.type }));
	const metaLen = new Uint8Array(4);
	new DataView(metaLen.buffer).setUint32(0, meta.length, false);
	const fileData = new Uint8Array(await file.arrayBuffer());
	const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, fileData));
	const out = new Uint8Array(32 + 12 + 4 + meta.length + ct.length);
	let o = 0;
	out.set(salt, o); o += 32;
	out.set(iv, o); o += 12;
	out.set(metaLen, o); o += 4;
	out.set(meta, o); o += meta.length;
	out.set(ct, o);
	return FILE_MARKER + toBase64(out);
}

/** Entschlüsselt einen Datei-Block → { blob, name, type }. */
export async function decryptFile(payload: string, password: string): Promise<{ blob: Blob; name: string; type: string }> {
	assertCrypto();
	const clean = payload.trim().replace(FILE_MARKER, '').replace(MARKER, '').trim();
	const combined = fromBase64(clean);
	const salt = combined.slice(0, 32);
	const iv = combined.slice(32, 44);
	const metaLen = new DataView(combined.buffer, combined.byteOffset + 44, 4).getUint32(0, false);
	const meta = JSON.parse(dec.decode(combined.slice(48, 48 + metaLen)));
	const data = combined.slice(48 + metaLen);
	const key = await deriveKey(password, salt);
	const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, data as BufferSource);
	return { blob: new Blob([pt], { type: meta.type || 'application/octet-stream' }), name: meta.name || 'datei', type: meta.type || '' };
}

export function isEncryptedBlock(text: string): 'text' | 'file' | null {
	const t = text.trim();
	if (t.startsWith(FILE_MARKER)) return 'file';
	if (t.startsWith(MARKER)) return 'text';
	return null;
}
