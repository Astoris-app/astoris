---
name: Astoris Projekt
description: Self-hosted KI-Workspace (SvelteKit, Open-Core) mit Firma-OS, Add-on-Sandbox und Tresor
alwaysApply: true
---
# Astoris
Quelle der Wahrheit ist `README.md` (Funktionen, Architektur) und `CLAUDE.md` (Betriebsregeln) im Repo-Root.

## Stack
- SvelteKit 2 (`@sveltejs/kit` ^2.63), Svelte 5 (Runes), TypeScript 6, Vite 8, `@sveltejs/adapter-node`
- Reines CSS-Design-System (`src/lib/styles/app.css`), keine UI-Library, kein Tailwind
- Keine Datenbank: AES-256-GCM-verschlüsselte Dateien unter `data/` (`store.ts` + `crypto.ts`)
- Auth: scrypt-Passwort oder Tailscale-whois, Sessions in `hooks.server.ts`
- KI: beliebige OpenAI-kompatible Engine (Clawy/agent-v2, vLLM, Ollama, Claude, OpenAI) über `engine.ts`
- Deploy: `docker compose up -d --build` (Non-Root-Container + Caddy für TLS auf 80/443), Dev-Port 5180
- Laufzeit-Deps nur `marked` + `dompurify`

## Befehle
- `pnpm run dev -- --port 5180` — Entwicklung
- `pnpm run check` — svelte-check
- `pnpm run build && node build` — Produktion (adapter-node)
- `bash setup.sh` — geführte Einrichtung (HTTPS, `.env`)

## Struktur
- `src/hooks.server.ts` — Auth- und Onboarding-Guard, setzt `event.locals.user`
- `src/lib/server/` — nur serverseitig: `engine.ts`, `auth.ts`, `store.ts`/`crypto.ts`, `sandbox.ts` (node:vm), `connector-tests.ts` (SSRF-gehärtet), `constitution.ts`, `audit.ts`, `tools.ts`
- `src/routes/api/*/+server.ts` — REST + SSE-Endpunkte
- `src/routes/<app>/+page.svelte` — die 20+ Apps (tresor, firma, crm, calendar, settings …)
- `src/lib/stores/*.svelte.ts` — Runes-Stores (i18n, theme, engine, voice); `src/lib/i18n/dict.ts` — DE/EN-Wörterbuch
- `src/lib/plugins/`, `src/lib/connectors.ts` — Add-on- und Connector-Katalog

## Harte Regeln
- Eigenes „Maschinenraum"-Design — nicht an agent-v2 oder die Behörden-Projekte angleichen.
- Security-Findings vom Audit 2026-06-26 bleiben drin: SSRF-Guard, Auto-Send-Riegel (`sendMode.ts`), `.env`-Escaping (`envSync.ts`), CSP, Cookies `strict`. Nicht wegrefactoren.
- `node:vm`-Sandbox ist KEINE echte Isolation — Astoris nicht für fremde Nutzer freigeben, bis microVM/WASM da ist.
- `constitution.json` darf die KI nur lesen, nie schreiben. Jede Selbstentwicklungs-Aktion ins Audit-Log.
- Ausgehende Nachrichten (Mail/Messenger) nur als Entwurf + Bestätigung, außer der Nutzer hat Direktversand aktiviert.
- Projekt wird öffentlich: keine internen Pfade, Tailscale-Namen, IPs oder Fallnummern anderer Projekte in Code, Doku oder Beispieldaten.
- `data/` und `certs/` nie in Git. Secrets nur aus Env; `.env` nie lesen.
- Deutsch in Antworten, Englisch in Code-Kommentaren.
