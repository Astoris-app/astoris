# Astoris — Plan: Verschlüsselter Messenger (Crypt-Chat)

## Vision
Im Assistent ein **Toggle**: „Assistent" (KI-Chat) ↔ „Verschlüsselt" (Messenger). Im Messenger
schreibt man Nachrichten, die **AES-256 (Tresor)** verschlüsselt und über einen **Social-Kanal
als Transport** (Telegram / WhatsApp / Signal / E-Mail) verschickt werden. Das Gegenüber
entschlüsselt sie mit demselben Schlüssel in seinem Astoris (oder einem kompatiblen Dashboard).
→ Ein **eigenes E2E-Nachrichtensystem**, das fremde Kanäle nur als „Briefträger" nutzt. Der
Kanal-Betreiber (Telegram etc.) sieht nur verschlüsselten Text.

## Kern-Prinzip
```
Nachricht ──AES-256(Schlüssel)──▶ verschlüsselter Block ──[Kanal]──▶ Gegenüber
                                                                        │
                                                          gleicher Schlüssel ▼
                                                              entschlüsselte Nachricht
```
Format-kompatibel zum vorhandenen Tresor (AES256CHAT-Block). Schlüssel = Passphrase, einmal
**out-of-band** geteilt (persönlich/QR), nie über den Kanal.

## Realität der Kanäle (ehrlich)
| Kanal | Senden | Empfangen (automatisch) | Aufwand |
|---|---|---|---|
| **Telegram** | ✅ Bot-API | ✅ Polling/Webhook | **Niedrig** (Connector existiert) |
| **E-Mail** | ✅ SMTP | ✅ IMAP (existiert) | **Niedrig** |
| **WhatsApp** | ⚠️ keine offene API | ⚠️ nur Business-API/Web (fragil) | Hoch → MVP: Teilen-Link |
| **Signal** | ⚠️ signal-cli (self-host) | ⚠️ signal-cli | Hoch → MVP: Teilen-Link |

**Fazit:** Echter Auto-Versand+Empfang realistisch über **Telegram + E-Mail**. WhatsApp/Signal
zunächst als **Teilen-Link** (manuell, wie heute im Tresor).

## Phasen
**Phase 1 — Messenger-UI + Toggle + Senden**
- Toggle „Assistent / Verschlüsselt" im Assistent-Header.
- Chat-Ansicht (Sprechblasen) mit Passphrase-Feld + Kanal-Wahl.
- Senden: Nachricht → Tresor-Verschlüsselung → über **Telegram-Bot** oder **E-Mail (SMTP)**
  an einen Kontakt senden. WhatsApp/Signal: Teilen-Link.
- Lokaler Verlauf (entschlüsselt nur im Browser sichtbar).

**Phase 2 — Empfang (automatisch)**
- Telegram-Bot-Polling + IMAP-Check erkennen eingehende **verschlüsselte Blöcke**.
- Auto-Entschlüsselung mit dem Kontakt-Schlüssel → erscheint im Chat.
- Hintergrund-Listener (wie agent-v2 IMAP-IDLE / Telegram-Poll).

**Phase 3 — Kontakte & Schlüssel**
- Kontaktliste (Name, Kanal-Adresse, Schlüssel-Fingerprint).
- Schlüssel-Tausch per QR/Link (out-of-band), pro Kontakt eigener Schlüssel.
- Threads pro Kontakt, Zustellstatus.

## Sicherheit
- Verschlüsselung **client-seitig** (Zero-Knowledge, wie Tresor) — der Server sieht nur Chiffretext.
- Schlüssel nie über den Transportkanal.
- Verschlüsselte Blöcke klar markiert (Astoris-Header), damit der Empfänger sie erkennt.

## Empfehlung
**Phase 1 zuerst** (UI + Toggle + Senden über Telegram/E-Mail + Teilen-Link für WA/Signal).
Das ist der sichtbare, nutzbare Kern. Empfang (Phase 2) baut darauf auf.
