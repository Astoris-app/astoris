---
name: Svelte-5-Konventionen
description: Regeln für Svelte-Komponenten, Runes-Stores und API-Routen
globs: ["src/**/*.svelte", "src/**/*.svelte.ts", "src/routes/api/**/*.ts"]
alwaysApply: false
---
- Svelte 5 Runes: `$state`, `$derived`, `$props`; kein `export let`, kein `$:`.
- Globaler Zustand als Klasse mit `$state`-Feldern in `src/lib/stores/*.svelte.ts` (Muster: `i18n.svelte.ts`, `theme.svelte.ts`), exportiert als Singleton-Instanz.
- Texte nie hart codieren: `i18n.t('bereich.schluessel')` nutzen und Schlüssel in `src/lib/i18n/dict.ts` für `de` UND `en` anlegen.
- API-Routen in `src/routes/api/<name>/+server.ts`: `json()`/`error()` aus `@sveltejs/kit`, Body mit `request.json().catch(() => ({}))` lesen, Felder manuell per `.toString()` normalisieren (keine Validierungslib im Repo).
- Seiten laden Daten client-seitig per `fetch('/api/…')` in `onMount`; Server-Module aus `$lib/server/*` nie in Client-Code importieren.
- Styling nur mit dem eigenen CSS-System (`src/lib/styles/app.css`, Design-Tokens); keine UI-Library, keine Utility-Frameworks.
- Markdown-Ausgabe immer über `marked` + `dompurify` (`src/lib/markdown.ts`), nie rohes `{@html}` von Nutzer-/KI-Text.
