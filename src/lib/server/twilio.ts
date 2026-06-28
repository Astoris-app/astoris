// Twilio-Webhook-Sicherheit: Signatur-Prüfung (X-Twilio-Signature).
// Twilio bildet HMAC-SHA1(base64) über die exakte Webhook-URL + alle POST-Parameter
// alphabetisch nach Schlüssel sortiert und konkateniert (key+value, ohne Trenner),
// signiert mit dem Auth Token. Schlägt die Prüfung fehl, lehnen wir den Request ab.

import crypto from 'node:crypto';

/**
 * Baut die für die Signatur maßgebliche URL. Twilio signiert die EXAKT in der
 * Console eingetragene URL — hinter einem Tunnel weicht der Host-Header oft ab,
 * daher bevorzugt die konfigurierte öffentliche Basis-URL.
 */
export function publicUrlFor(publicBase: string | undefined, pathname: string, fallbackUrl: string): string {
	const base = (publicBase ?? '').trim().replace(/\/+$/, '');
	if (base) return base + pathname;
	return fallbackUrl;
}

/** Prüft die Twilio-Signatur. Fail-closed: ohne Token/Signatur immer false. */
export function verifyTwilioSignature(
	authToken: string | undefined,
	url: string,
	params: Record<string, string>,
	signature: string | null
): boolean {
	if (!authToken || !signature) return false;
	const data = url + Object.keys(params).sort().map((k) => k + params[k]).join('');
	const expected = crypto.createHmac('sha1', authToken).update(Buffer.from(data, 'utf8')).digest('base64');
	const a = Buffer.from(expected, 'utf8');
	const b = Buffer.from(signature, 'utf8');
	if (a.length !== b.length) return false;
	try {
		return crypto.timingSafeEqual(a, b);
	} catch {
		return false;
	}
}

/** Liest einen x-www-form-urlencoded Body in ein flaches String-Record. */
export function parseForm(raw: string): Record<string, string> {
	const out: Record<string, string> = {};
	const sp = new URLSearchParams(raw);
	for (const [k, v] of sp.entries()) out[k] = v;
	return out;
}
