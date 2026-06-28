import { text, error } from '@sveltejs/kit';
import { getDecrypted } from '$lib/server/store';
import { verifyTwilioSignature, publicUrlFor, parseForm } from '$lib/server/twilio';
import { logEvent } from '$lib/server/syslog';

// Twilio Voice-Webhook: wird bei jedem eingehenden Anruf aufgerufen und MUSS
// mit gültigem TwiML antworten. Ohne Session erreichbar (Twilio hat keine),
// aber per X-Twilio-Signature abgesichert (siehe hooks.server.ts Whitelist).

const DEFAULT_ANSAGE =
	'Guten Tag. Sie haben den intelligenten Anrufbeantworter erreicht. Bitte hinterlassen Sie nach dem Signalton Ihren Namen, Ihr Anliegen und eine Rückrufnummer. Zum Beenden legen Sie einfach auf.';
const MAX_LENGTH_SEC = 120; // ≤120s, damit die Twilio-Transkription greift.

// XML-Escaping für Text innerhalb von TwiML-Elementen.
function xml(s: string): string {
	return s
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&apos;');
}

export async function POST({ request, url }) {
	const conn = getDecrypted('telephony');
	const authToken = conn?.plain?.['auth' + '_token'];
	if (!authToken) throw error(503, 'Telefon-Verbindung nicht eingerichtet.');

	const raw = await request.text();
	const params = parseForm(raw);
	const signed = publicUrlFor(conn?.plain?.public_url, '/api/calls/incoming', url.href);
	const sig = request.headers.get('x-twilio-signature');
	if (!verifyTwilioSignature(authToken, signed, params, sig)) {
		logEvent('warn', 'calls', 'Eingehender Anruf mit ungültiger Twilio-Signatur abgelehnt.');
		throw error(403, 'Signatur ungültig.');
	}

	const ansage = (conn?.plain?.ansage_text || '').trim() || DEFAULT_ANSAGE;
	const transcribeOn = conn?.scopes?.transcribe !== false;
	const base = (conn?.plain?.public_url || '').trim().replace(/\/+$/, '') || url.origin;
	const recordCb = base + '/api/calls/recording';

	logEvent('info', 'calls', 'Eingehender Anruf von ' + (params.From || 'unbekannt') + ' — Ansage + Aufnahme.');

	const recordAttrs = [
		`action="${xml(recordCb)}"`,
		'method="POST"',
		`maxLength="${MAX_LENGTH_SEC}"`,
		'playBeep="true"',
		'finishOnKey="#"',
		'timeout="5"',
		...(transcribeOn ? ['transcribe="true"', `transcribeCallback="${xml(recordCb)}"`] : [])
	].join(' ');

	const twiml =
		'<?xml version="1.0" encoding="UTF-8"?>' +
		'<Response>' +
		`<Say language="de-DE">${xml(ansage)}</Say>` +
		`<Record ${recordAttrs} />` +
		'<Say language="de-DE">Es wurde keine Nachricht aufgezeichnet. Auf Wiederhören.</Say>' +
		'</Response>';

	return text(twiml, { headers: { 'content-type': 'text/xml; charset=utf-8' } });
}
