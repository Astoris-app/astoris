# Astoris — Roadmap: KI-Betriebssystem für die Firma

> **Vision:** Astoris ist die KI-Zentrale, die deine Firma versteht, organisiert und
> Schritt für Schritt autonomer betreibt. Von Ziel zu Umsatz, mit Agenten.
> Nicht „Chat mit Tools" — die **Firma selbst als lebendes System**.

## Querschnitts-Prinzipien (gelten für JEDEN Schritt — Pflicht)
- 🌍 **Zweisprachig** — alles DE + EN über i18n, keine hartkodierten UI-Texte.
- 📱 **Mobile-first** — jede neue UI responsive (Off-Canvas-Nav existiert bereits).
- 🔎 **SEO / AEO / GEO** (Landing + öffentliche Seiten) — strukturierte Daten (JSON-LD),
  klare faktische Antworten (FAQ), `llms.txt`, semantisches HTML, schnelle Ladezeiten.
  Sichtbarkeit in Google **und** generativen KIs (ChatGPT/Claude/Perplexity).
- ✅ **Sauber** — `pnpm check` 0 Errors, getestet, committed, REDACTED-frei.
- 🔒 **Security** — API-Schutz, klare Autonomie-Grenzen.

## Fundament (existiert bereits)
Company Core (Profil/Mission/Rollen/Agenten/Wissensbasis) · Agenten mit Persona/Modell/Tools/
Aufgaben-Verlauf · Orchestrierung (`run-company`) · 29 Add-ons · Connectoren (Mail/Kalender) ·
KI-Engine (lokal+Cloud, Tool-Calling).

## Phasen

### Phase 1 — Vision-Beweis (MVP)
1. **Goals-System** — Ziele/Unterziele, Metriken, Status, Deadline, Priorität, Agent-Zuordnung ← *Start*
2. **Company-Dashboard als Startseite** — Goals-Fortschritt, Agenten-Aktivität, offene Entscheidungen
3. **Company Feed** — Arbeitsstrom: jede Agenten-Aktion + Entscheidung

### Phase 2 — Firma als System
4. **Strukturiertes Memory** — Firma/Produkt/Kunde/Entscheidungen getrennt (heute ein Klotz `knowledge`)
5. **Autonomie-Level** pro Agent — 0 analysieren · 1 vorschlagen · 2 Entwurf · 3 nach Freigabe · 4 in Grenzen · 5 autonom
6. **Task/Action-System** — jede Agenten-Aktion mit Status, Freigabe, Ergebnis

### Phase 3 — Geschäft
7. **CRM-Light** — Kunden, Leads, Kontakte, Deals, Notizen, Produkte, Preise, Zielgruppen
8. **Marketing-Modul** — Website-Analyse, Content-Ideen, Social-Posts, Ads-Ideen, Kampagnenplan

### Phase 4 — Autonomie & Wachstum
9. **Integrationen** — Google Ads/Search Console, Meta/LinkedIn/X, Stripe/Shop, Analytics
10. **Optimierungs-Schleifen** — Maßnahme → messen → bewerten → lernen → besser (der eigentliche Vorsprung)

### Querschnitts-Strang — SEO/AEO/GEO (Landing, parallel/iterativ)
- JSON-LD: Organization, SoftwareApplication, FAQPage
- `llms.txt` + klare, zitierfähige faktische Antworten
- Vollständige Meta/OG/Twitter (DE+EN), `sitemap.xml`
- FAQ-Seite mit strukturierten Frage-Antwort-Paaren

## Positionierung
**Astoris ist das KI-Betriebssystem für deine Firma.** Richte Ziele, Produkte, Kunden, Kanäle
und Agenten ein — Astoris plant, priorisiert, schreibt, analysiert, automatisiert und optimiert
den Alltag.

## Fortschritt
- [ ] Phase 1.1 Goals-System
- [ ] Phase 1.2 Company-Dashboard
- [ ] Phase 1.3 Company Feed
- [ ] Phase 2 …
