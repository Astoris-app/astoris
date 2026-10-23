# Astoris installieren

Schritt-für-Schritt-Anleitung, um Astoris auf deinem eigenen Server einzurichten.
Astoris läuft auf deiner Hardware. Bei Nutzung externer Modelle oder Dienste werden
die dafür übermittelten Inhalte an den jeweiligen Anbieter gesendet.

**Nach der Installation weiterarbeiten:** Das [Astoris-Handbuch](docs/HANDBUCH.md)
beschreibt Start, Anmeldung, Modellverbindung, KI-Einrichtung und sicheren Betrieb.

---

## 1. Voraussetzungen

- **Node.js 22.13 oder neuer** — prüfen mit `node -v` (sonst: https://nodejs.org)
- **pnpm** (empfohlen) oder npm — `npm install -g pnpm`
- **Optional, empfohlen:** [Tailscale](https://tailscale.com/download) für sicheren Fernzugriff
  ohne offene Ports + automatische Anmeldung
- Eine KI-Quelle (eine reicht):
  - **Lokales Modell** (vLLM/Ollama, z. B. `http://localhost:8000`) — volle Souveränität, oder
  - **Cloud-KI** (Anthropic/OpenAI) — falls keine GPU vorhanden

---

## 2. Herunterladen & einrichten

```bash
git clone <REPO-URL> astoris
cd astoris
bash setup.sh
```

Das **Setup-Script** führt dich durch:
1. Prüft Node/pnpm
2. Installiert die Abhängigkeiten
3. Legt die `.env` an
4. **HTTPS einrichten** — wähle eine Option:
   - **Tailscale-Zertifikat** (empfohlen): gültiges Zertifikat, keine Browser-Warnung
   - **Selbstsigniert**: zum lokalen Testen (Browser zeigt einmalig eine Warnung)
   - **Reverse-Proxy**: TLS übernimmt z. B. Caddy/nginx davor
   - **Überspringen**: nur `http://localhost`

> **Warum HTTPS?** Verschlüsselung (Tresor), Mikrofon und sichere Anmelde-Cookies
> funktionieren nur über HTTPS (oder `localhost`).

---

## 3. Starten

**Entwicklung / einfacher Betrieb:**
```bash
pnpm run dev -- --port 5180
```

**Produktion (dauerhaft):**
```bash
pnpm run build
node build      # startet den Server (Port über PORT-Variable, Standard 3000)
```

Aufrufen: `https://DEIN-SERVER:5180` (bzw. dein Tailscale-Name, z. B.
`https://meinserver.dein-tailnet.ts.net:5180`).

---

## 4. Firewall (wenn du Tailscale nutzt)

Port nur über Tailscale erreichbar machen (nicht offen im Internet/LAN):
```bash
sudo ufw allow in on tailscale0 to any port 5180 proto tcp
```

---

## 5. Erster Start im Browser

1. **Zugang einrichten** — beim ersten Aufruf öffnet sich `/login`. Du legst fest:
   - **Benutzername + Passwort**, oder
   - **Anmeldung per Tailscale** (1 Klick, kein Passwort nötig)
   Hinter einem Reverse-Proxy kann ein vom Betreiber bereitgestellter
   `ASTORIS_SETUP_TOKEN` nötig sein: **Einrichtung über einen Reverse-Proxy?**
   aufklappen und den Wert ausschließlich im geheimen Eingabefeld eintragen.
2. **Onboarding** — nach erfolgreicher Anmeldung startet die kurze Einführung;
   Profil wählen (Persönlich/Firma). Firmen und Konten werden nur angemeldet eingerichtet.
3. **KI verbinden** — gehe zu **Verbindungen → Lokale Modelle** (oder **Cloud-KI**)
   und trage deinen Endpoint ein (z. B. `http://localhost:8000`). Wird beim Speichern
   live getestet.

Danach kannst du im **Assistent** sofort chatten.

---

## 6. Konten verbinden (optional)

Unter **Verbindungen** kannst du Konten hinzufügen, die die KI bedienen darf:
E-Mail (IMAP), Telegram, Trello, Stripe, WebDAV/Nextcloud, Google Kalender.
Du bestimmst pro Verbindung, **was** erlaubt ist — sensible Aktionen sind standardmäßig aus.
Zugangsdaten werden verschlüsselt gespeichert (AES-256-GCM).

---

## 7. Aktualisieren

```bash
cd astoris
git pull
pnpm install
pnpm run build   # nur bei Produktionsbetrieb
```

Deine Daten (`./data`) und Zertifikate (`./certs`) bleiben erhalten — sie werden nie
überschrieben oder versioniert.

---

## Wichtige Verzeichnisse

| Pfad | Inhalt |
|---|---|
| `./data` | Verschlüsselte Verbindungen, Zugangsdaten, Personas, Firma (chmod 700, nie in Git) |
| `./data/runtime.sqlite` | Verschlüsselte Payloads für Agentenläufe, fachliche Daten und Sitzungen; WAL/SHM bei laufender Datenbank beachten |
| `./certs` | TLS-Zertifikate (privater Schlüssel, nie in Git) |
| `./.env` | Konfiguration (z. B. ENGINE_URL); enthält zusätzlich gespiegelte Verbindungs-Credentials (`ASTORIS_*`) — wie `data/` behandeln, nie in Git |

Fachliche JSON-Bestände werden beim ersten Zugriff einmalig nach SQLite übernommen;
ihre Originaldateien bleiben erhalten. Migration, Datensicherung und vollständiger Rollback:
[Agentenlaufzeit und Betrieb](docs/RUNTIME.md).

---

## Probleme?

- **„Verschlüsselung braucht HTTPS"** im Tresor → du bist über `http://` verbunden.
  HTTPS einrichten (Schritt 2) oder über `https://` / `localhost` öffnen.
- **Chat antwortet nicht** → unter **Verbindungen** ein Modell eintragen und testen.
- **Mikrofon ausgegraut** → braucht HTTPS (siehe oben).
- **Fragen:** info@astoris.org
