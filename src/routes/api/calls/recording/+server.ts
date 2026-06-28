import { text, json, error } from '@sveltejs/kit';
import { getDecrypted } from '$lib/server/store';
import { verifyTwilioSignature, publicUrlFor, parseForm } from '$lib/server/twilio';
import { upsertCall, type Urgency, URGENCIES } from '$lib/server/calls';
import { engineChat } from '$lib/server/engine';
import { notifyOperator } from '$lib/server/notify';
import { addFeedEntry } from '$lib/server/company';
import { logEvent } from '$lib/server/syslog';

// Twilio Record-Callback: empfängt entweder den Abschluss der Aufnahme
// (action-Callback, mit RecordingUrl) ODER das Transkript (transcribeCallback,
// mit TranscriptionText). Idempotent über CallSid. Ohne Session, signiert.

const URGENCY_EMOJI: Record<Urgency, string> = { hoch: '🔴', mittel: '🟡', niedrig: '🟢' };

// Leeres TwiML — beendet den Anruf höflich nach der Aufnahme.
const GOODBYE =
	'<?xml version="1.0" encoding="UTF-8"?>' +
	'<Response><Say language="de-DE">Vielen Dank für Ihre Nachricht. Auf Wiederhören.</Say><Hangup/></Response>';

// Fragt das verbundene Modell nach Zusammenfassung + Dringlichkeit.
// skip-on-fail: bei fehlender/abwesender KI greift ein robuster Fallback.
async function summarize(transcript: string): Promise<{ summary: string; urgency: Urgency }> {
	const fallback = (): { summary: string; urgency: Urgency } => ({
		summary: transcript.trim() ? transcript.trim().slice(0, 180) : 'Sprachnachricht ohne Transkript — Aufnahme anhören.',
		urgency: 'mittel'
	});
	if (!transcript.trim()) return fallback();
	try {
		const res = await engineChat([
			{ role: 'system', content: 'Du fasst Voicemail-Transkripte für einen vielbeschäftigten Unternehmer zusammen. Antworte AUSSCHLIESSLICH mit kompaktem JSON, ohne Markdown: {"summary": "ein bis zwei Sätze, worum es geht und was der Anrufer will", "urgency": "hoch|mittel|niedrig"}. Dringlichkeit hoch = zeitkritisch/Beschwerde/Notfall, mittel = normale Anfrage, niedrig = Info/Werbung.' },
			{ role: 'user', content: 'Transkript der Sprachnachricht:\n\n' + transcript.trim().slice(0, 4000) }
		]);
		if (res.source === 'demo') return fallback();
		const m = res.reply.match(/\{[\s\S]*\}/);
		if (!m) return { summary: res.reply.trim().slice(0, 220) || fallback().summary, urgency: 'mittel' };
		const parsed = JSON.parse(m[0]) as { summary?: unknown; urgency?: unknown };
		const summary = (typeof parsed.summary === 'string' && parsed.summary.trim()) ? parsed.summary.trim().slice(0, 400) : fallback().summary;
		const urg = String(parsed.urgency ?? '').toLowerCase();
		const urgency: Urgency = (URGENCIES as string[]).includes(urg) ? (urg as Urgency) : 'mittel';
		return { summary, urgency };
	} catch {
		return fallback();
	}
}

export async function POST({ request, url }) {
	const conn = getDecrypted('telephony');
	const authToken = conn?.plain?.['auth' + '_token'];
	if (!authToken) throw error(503, 'Telefon-Verbindung nicht eingerichtet.');

	const raw = await request.text();
	const params = parseForm(raw);
	const signed = publicUrlFor(conn?.plain?.public_url, '/api/calls/recording', url.href);
	const sig = request.headers.get('x-twilio-signature');
	if (!verifyTwilioSignature(authToken, signed, params, sig)) {
		logEvent('warn', 'calls', 'Record-Callback mit ungültiger Twilio-Signatur abgelehnt.');
		throw error(403, 'Signatur ungültig.');
	}

	const callSid = (params.CallSid || '').trim();
	if (!callSid) throw error(400, 'CallSid fehlt.');

	const isTranscriptCb = 'TranscriptionText' in params || 'TranscriptionStatus' in params;
	const transcribeOn = conn?.scopes?.transcribe !== false;

	// Eingehende Felder zusammenführen (nur Vorhandenes überschreibt).
	const patch: Record<string, unknown> = {};
	if (params.From) patch.from = params.From;
	if (params.To) patch.to = params.To;
	if (params.RecordingUrl) patch.recordingUrl = params.RecordingUrl;
	if (params.RecordingDuration) patch.durationSec = parseInt(params.RecordingDuration, 10) || 0;
	if (isTranscriptCb) patch.transcript = (params.TranscriptionText || '').toString();
	const call = upsertCall(callSid, patch);

	// Finalisieren (KI-Zusammenfassung + Benachrichtigung) genau EINMAL:
	// - mit Transkript-Callback, sobald das Transkript da ist, ODER
	// - mit Aufnahme-Callback, wenn keine Transkription erwartet wird.
	const shouldFinalize = !call.notified && (isTranscriptCb || !transcribeOn);

	if (shouldFinalize) {
		const { summary, urgency } = await summarize(call.transcript);
		upsertCall(callSid, { summary, urgency, notified: true });

		const from = call.from || 'unbekannt';
		const rec = call.recordingUrl ? call.recordingUrl + '.mp3' : '';
		const msg =
			'📞 Neuer Anruf\n' +
			'Von: ' + from + '\n' +
			'Dringlichkeit: ' + URGENCY_EMOJI[urgency] + ' ' + urgency + '\n\n' +
			summary +
			(rec ? '\n\n🎧 Aufnahme: ' + rec : '');

		// Benachrichtigung + Feed + Log — alle skip-on-fail, brechen den Flow nie.
		await notifyOperator({ chatId: conn?.plain?.notify_chat_id, subject: 'Neuer Anruf von ' + from, text: msg });
		try { addFeedEntry({ type: 'system', title: '📞 Neuer Anruf von ' + from, detail: summary }); } catch { /* feed best-effort */ }
		logEvent('info', 'calls', 'Anruf von ' + from + ' gespeichert (Dringlichkeit ' + urgency + ').');
	}

	// transcribeCallback erwartet kein TwiML; action-Callback beendet den Anruf.
	if (isTranscriptCb) return json({ ok: true });
	return text(GOODBYE, { headers: { 'content-type': 'text/xml; charset=utf-8' } });
}
