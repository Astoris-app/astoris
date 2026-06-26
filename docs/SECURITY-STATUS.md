# Astoris — Security-Status (für Re-Audit / Codex)

**Stand:** 2026-06-26. Self-hosted SvelteKit AI-Workspace, Single-Operator-Modell.
Die Findings des unabhängigen Audits wurden adressiert — hier der aktuelle Stand.

## Audit-Findings + Status

### HOCH-1 — APIs vor abgeschlossener Auth offen → ✅ GEFIXT
- **War:** `hooks.server.ts` schützte API-Routen erst bei `isSetupDone() && authConfigured()`. Davor waren u.a. `/api/plugins` (Code-Add-on Upload+Ausführung = RCE), `/api/connections`, `/api/docs`, `/api/company` offen.
- **Jetzt:** Geschützte APIs brauchen IMMER eine Session. Vor abgeschlossener Auth ist nur eine Whitelist offen (Onboarding-Flow): `/api/auth`, `/api/setup`, `/api/engine`, `/api/connections`. Alles andere → 401 — auch während des Erst-Setups.
- **Verifiziert:** `curl` ohne Session → `/api/plugins`, `/api/company`, `/api/mail` = **401**.

### HOCH-2 — First-Setup aus dem Netzwerk übernehmbar → ✅ GEFIXT
- `set-password` (pre-auth) ist jetzt beschränkt auf: **localhost** ODER **Tailscale-Identität** ODER gültiges **ASTORIS_SETUP_TOKEN** (env). Sonst **403**.
- Reverse-Proxy ohne Tailscale: Betreiber setzt `ASTORIS_SETUP_TOKEN` (in `.env.example` dokumentiert) und gibt es im Welcome-Schritt ein.

### MITTEL-3 — Secrets zusätzlich im Klartext in .env → ✅ GEFIXT (Opt-in)
- Spiegelung ist jetzt **OPT-IN** via `ASTORIS_MIRROR_ENV=true` (Standard **AUS**). Standardmäßig liegen Credentials nur AES-256-GCM-verschlüsselt in `data/connections.json`.

### MITTEL-4 — node:vm ist keine harte Sandbox → ⚠️ BEWUSST AKZEPTIERT
- Add-ons laufen mit Betreiber-Rechten (Single-Operator-Modell; Add-ons werden vom Betreiber selbst erstellt/importiert). SSRF-Guard (`guardedFetch`) ist aktiv. Für Multi-User/untrusted Plugins ist `isolated-vm` geplant — nicht launch-blockierend für Single-Operator-Self-Host.

### NIEDRIG-5 — CSP erlaubt inline-Skripte → ⚠️ DEFERRED (niedrig)
- `script-src 'unsafe-inline'` (Caddyfile) bleibt vorerst — SvelteKit-Hydration benötigt Inline-Script. Saubere Nonce/Hash-Lösung via SvelteKit-CSP-Config ist vorgesehen. Niedrige Priorität.

## Vom Audit als gut bestätigt (unverändert)
httpOnly + sameSite=strict Cookies · scrypt fürs Passwort · zufällige Session-Tokens · AES-256-GCM für gespeicherte Verbindungen · Pfadvalidierung (Docs) · DOMPurify (Markdown) · SSRF-Guard (Sandbox-fetch) · `pnpm audit --prod` ohne bekannte Vulnerabilities · `pnpm check`/`build` sauber.

## Offene Launch-Punkte (nicht security-kritisch)
- GitHub-Repo noch privat (Public-Schalten später).
- Legal: CHE-Nr. + Entfernen des Platzhalter-Banners nach Finalisierung.
- connectors.ts / Branchen-Templates i18n (EN-Modus zeigt dort noch Deutsch).
