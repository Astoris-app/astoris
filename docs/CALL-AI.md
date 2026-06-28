# KI-Anrufbeantworter — Stufe 1: Intelligente Voicemail (Twilio)

Eingehender Anruf → konfigurierbare Ansage → Aufnahme → (Twilio-)Transkript →
KI-Zusammenfassung + Dringlichkeit → Benachrichtigung (Telegram/E-Mail) +
Eintrag auf der Seite **Anrufe** + Company-Feed.

**Kein Echtzeit-Dialog** — der Anrufer hinterlässt eine Nachricht, die KI fasst sie
zusammen. Provider: **Twilio**.

> **Wichtig:** Astoris läuft Tailscale-intern. Twilio erreicht es nur über einen
> **öffentlichen Endpoint**. Ohne öffentlichen Tunnel kann Twilio die Webhooks
> nicht zustellen — dann passiert nichts.

---

## 1. Twilio-Nummer kaufen

1. Konto auf <https://www.twilio.com> anlegen.
2. **Phone Numbers → Buy a number** — eine Nummer mit Fähigkeit **Voice** kaufen
   (z. B. eine deutsche oder eine günstige internationale Nummer).
3. In der **Twilio Console** findest du oben **Account SID** und **Auth Token** —
   beides brauchst du gleich für die Verbindung.

## 2. Öffentlichen Tunnel bereitstellen

Astoris ist nur im Tailnet erreichbar. Damit Twilio die Webhooks aufrufen kann,
brauchst du eine öffentliche HTTPS-URL, die auf den Astoris-Port zeigt.

**Option A — Cloudflare Tunnel (empfohlen, stabile URL):**
```bash
cloudflared tunnel --url http://localhost:5173   # Dev
# oder den Produktions-Port von Astoris
```
Cloudflare gibt dir eine URL wie `https://zufall.trycloudflare.com`.

**Option B — ngrok (schnell, URL wechselt im Free-Tier):**
```bash
ngrok http 5173
```

Notiere die öffentliche Basis-URL, z. B. `https://zufall.trycloudflare.com`.
Diese trägst du im Connector als **Öffentliche URL** ein — sie wird für die
**Signatur-Prüfung** der Webhooks benötigt (Twilio signiert exakt die in der
Console eingetragene URL).

## 3. Connector in Astoris einrichten

**Verbindungen → Telefon (Twilio)** öffnen und ausfüllen:

| Feld | Wert |
|------|------|
| **Account SID** | aus der Twilio Console (`AC…`) |
| **Auth Token** | aus der Twilio Console (geheim) |
| **Telefonnummer** | deine Twilio-Nummer im E.164-Format, z. B. `+49…` |
| **Öffentliche URL** | Basis-URL deines Tunnels, z. B. `https://zufall.trycloudflare.com` |
| **Ansage-Text** *(optional)* | wird dem Anrufer vorgelesen; leer = Standard-Ansage |
| **Telegram Chat-ID** *(optional)* | wohin neue Anrufe per Telegram gemeldet werden |

Speichern testet die Zugangsdaten live gegen die Twilio-API.

**Benachrichtigung:** Ist eine **Telegram Chat-ID** gesetzt **und** die
Telegram-Verbindung eingerichtet, kommt die Meldung per Telegram. Sonst (oder bei
Fehlschlag) geht eine E-Mail an die **eigene Adresse** der E-Mail-Verbindung.

## 4. Webhook in Twilio eintragen

In der Twilio Console: **Phone Numbers → Manage → Active numbers → [deine Nummer]**.

Im Abschnitt **Voice Configuration / A call comes in**:

- **Webhook:** `https://DEINE-OEFFENTLICHE-URL/api/calls/incoming`
- **Methode:** `HTTP POST`

Speichern. Das war's für die Voice-Konfiguration — den Aufnahme- und
Transkript-Callback (`/api/calls/recording`) setzt Astoris automatisch im TwiML.

## 5. Testen

Ruf deine Twilio-Nummer an, hinterlasse nach dem Signalton eine kurze Nachricht
und leg auf. Nach wenigen Sekunden:

- erscheint der Anruf unter **Arbeitsplatz → Anrufe** (Nummer, Zeit,
  Dringlichkeits-Badge, Zusammenfassung, ausklappbares Transkript, Audio-Link),
- kommt eine **Telegram-/E-Mail-Benachrichtigung**,
- steht ein Eintrag im **Company-Feed** und im **Systemprotokoll**.

---

## Wie es funktioniert (Flow)

1. **`POST /api/calls/incoming`** (ohne Session, Twilio-signiert): antwortet mit
   **TwiML** — `<Say language="de-DE">`-Ansage + `<Record>` (Beep, `maxLength=120s`,
   `transcribe=true`, Callback auf `/api/calls/recording`).
2. **`POST /api/calls/recording`** (ohne Session, signiert): erhält den
   Aufnahme-Abschluss (RecordingUrl, Dauer) und — falls Transkription aktiv — das
   **Twilio-Transkript** (`TranscriptionText`). Beide Callbacks werden idempotent
   über die `CallSid` zusammengeführt.
3. **KI:** Sobald das Transkript vorliegt (oder bei deaktivierter Transkription
   direkt nach der Aufnahme), erzeugt `engineChat` **Zusammenfassung +
   Dringlichkeit** (hoch/mittel/niedrig). *skip-on-fail:* ist keine KI verbunden,
   wird der Anruf trotzdem gespeichert (Fallback-Zusammenfassung, Dringlichkeit
   „mittel").
4. **Benachrichtigung + Feed + Log**, genau einmal je Anruf.

### Sicherheit

- Die beiden Webhook-Routen sind die **einzigen** offenen `/api`-Routen ohne
  Session (Twilio bringt keine mit). Jeder Aufruf wird per
  **`X-Twilio-Signature`** geprüft (HMAC-SHA1 + Base64 über URL + sortierte
  POST-Parameter, signiert mit dem Auth Token). Schlägt die Prüfung fehl → `403`.
- `/api/calls` (Liste, „gelesen", Löschen) bleibt **session-pflichtig**.
- Account SID und Auth Token werden wie alle Connector-Felder **verschlüsselt**
  gespeichert.

---

## Grenzen / Stufe 1

- **Transkription:** Es wird **Twilio-Transcription** genutzt (nur für Aufnahmen
  ≤ 120 s, Sprache je nach Twilio-Region begrenzt). Liegt kein Transkript vor,
  bleibt das Transkript-Feld leer und die Zusammenfassung weist auf die Aufnahme
  hin.
- **TODO (Stufe 2):** eigenes **Whisper**-Transkript (lokal auf der GPU) für
  bessere/längere Erkennung, unabhängig von Twilio.
- Kein Echtzeit-Dialog, keine Rückruf-Automatik (bewusst — Stufe 1).
