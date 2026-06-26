# Astoris — Messenger-Kanäle (Recherche OpenClaw + Alternativen)

## OpenClaw (github.com/openclaw/openclaw)
Existiert wirklich (früher Moltbot/Clawdbot), **MIT-Lizenz**, self-hosted **AI-Gateway** für 23 Kanäle.
Architektur: Gateway-Prozess (Node), Plugin-Channel-SDK, Multi-Agent-Routing.
Schnittstelle: **CLI + WebSocket-RPC** — **kein stabiles REST-API** (Andocken etwas hemdsärmelig).

## Integrations-Wege
- **(a) An OpenClaw-Gateway andocken** — EIN Connector → alle Kanäle, MIT-erlaubt. Nachteil: CLI/WS-RPC, harte Abhängigkeit, junges Projekt.
- **(b) Matrix + Bridges** — robust, aber hoher Ops-Aufwand; exotische Kanäle fehlen.
- **(c) Jeder Kanal einzeln per API** — sauber, aber linear viel Aufwand; harte Kanäle trotzdem nicht offiziell.
- **Empfehlung: Hybrid** — einfache Kanäle selbst (c), harte Kanäle via OpenClaw-Sidecar (a).

## Kanal-Einstufung
**EINFACH (offene Bot/REST-API, selbst):** Telegram ✓, E-Mail ✓, Slack, Discord, Matrix, IRC, Twitch (IRC), Mattermost, Nextcloud Talk, Nostr, Synology Chat (Webhook), WebChat.
**MITTEL (API + App-Approval):** Microsoft Teams, Google Chat, LINE, Feishu, Zalo, QQ, Tlon.
**SCHWER (keine offene API):** WhatsApp (Baileys/QR, ToS-Graubereich), iMessage (macOS-Bridge), WeChat (QR, instabil), Signal (signal-cli), Zalo Personal (QR).

## Compliance-Warnung
WhatsApp/WeChat/iMessage über reverse-engineered/QR = **ToS-Graubereich, Account-Ban-Risiko**.
Für ein öffentliches Produkt (Astoris) ein echtes Thema — unabhängig von OpenClaws MIT.

## Stufenplan
1. **Telegram ✓, E-Mail ✓ → Slack, Discord, WebChat** (offene APIs, kein Approval, 80% Bedarf)
2. Matrix, IRC/Twitch, Mattermost, Nextcloud Talk, Nostr
3. Teams, Google Chat, LINE, Feishu, Zalo (Approval — nur bei konkretem Bedarf)
4. WhatsApp/iMessage/WeChat/Signal/QQ → **OpenClaw als Sidecar** (vorher ToS/Ban-Risiko bewerten)

Quellen: github.com/openclaw/openclaw, docs.openclaw.ai/channels
