# Astoris — Erweiterungs-/Plugin-System (Konzept)

> Ziel: Add-ons leicht integrieren (wir UND Nutzer), schrittweise Neues hinzufügen,
> damit Geld verdienen — ohne den Gratis-Kern anzufassen.

## Leitprinzip
Der **Kern bleibt schlank & gratis** (FSL). Erweiterungen docken über klar definierte
**Erweiterungspunkte** an — der Kern kennt nur die Schnittstelle, nicht das einzelne Add-on.

## Drei Erweiterungs-Typen (nach Aufwand)

### 1. Connector-Add-ons  ⭐ (am einfachsten — Phase 1)
Neue Verbindungstypen (z. B. Salesforce, DATEV, eine Branchen-API).
- Add-on liefert: eine **Connector-Definition** (Name, Icon, Felder, Berechtigungen) + einen **Test-/Use-Handler**.
- Rein daten-/config-getrieben → **zur Laufzeit ladbar, KEIN Rebuild**.
- **Ideal für Nutzer-Add-ons** (eigene Connectors einfach hinzufügen) und für verkaufbare Premium-Connectors.

### 2. Agent-Tool-Add-ons
Neue Fähigkeiten für die KI (z. B. „rechne", „durchsuche CRM", „erzeuge Rechnung").
- Add-on liefert: **Tool-Definition** (Name, Beschreibung, Parameter) + **Handler**.
- Server-seitig, laufzeit-ladbar. Die KI ruft das Tool bei Bedarf auf.

### 3. App-Add-ons  (für unsere Premium-Module)
Vollwertige neue Apps in der Rail (eigene UI/Seite).
- Braucht Build-Zeit-Integration (SvelteKit-Routen) → primär **von uns** gebaut & ausgeliefert.

## Manifest (jedes Add-on beschreibt sich selbst)
```json
{
  "id": "salesforce-connector",
  "name": "Salesforce",
  "version": "1.0.0",
  "type": "connector",          // connector | agent-tool | app
  "author": "Astoris",
  "premium": true,              // false = gratis/community
  "description": "Salesforce-Konten verbinden und von der KI bedienen lassen.",
  "icon": "<svg-path>",
  "entry": "index.js"
}
```

## Registry + Loader
- Verzeichnis `data/plugins/<id>/` (Nutzer legen Add-ons hier ab) + `data/plugins/registry.json` (aktiviert/deaktiviert).
- **Loader** beim Serverstart: scannt, validiert Manifest, registriert die Erweiterungspunkte.
- Sicherheit: Manifest-Validierung, Berechtigungen explizit, Premium-Add-ons brauchen Lizenz-Freischaltung.

## „Erweiterungen"-Bereich (UI)
Neuer Rail-Eintrag **Erweiterungen** (oder in Einstellungen): zeigt installierte + verfügbare
Add-ons, aktivieren/deaktivieren, Premium-Add-ons mit „Freischalten" (Lizenzschlüssel).

## Monetarisierung
- **Gratis-Add-ons**: Community/Marketing.
- **Premium-Add-ons**: Lizenzschlüssel schaltet sie frei. Verkauf über Website/„Astoris Store".
- Später: **Add-on-Marktplatz** (Dritt-Entwickler, Umsatzbeteiligung).

## Implementierungs-Phasen
1. **Plugin-Registry + Loader + Manifest-Typ** (Fundament).
2. **Connector-Add-ons** (Erweiterungspunkt + 1 Demo-Add-on) — sofort für Nutzer nutzbar.
3. **„Erweiterungen"-UI** (installieren/aktivieren).
4. **Agent-Tool-Add-ons**.
5. **Lizenz-Freischaltung** für Premium + erstes verkaufbares Add-on.
6. **App-Add-ons** + Marktplatz (später).

## Architektur-Hinweis (SvelteKit-Realität)
Connector- & Agent-Tool-Add-ons sind **laufzeit-ladbar** (Server-Module/Config) → echtes
„Nutzer fügt Add-on hinzu, kein Rebuild". App-Add-ons (volle UI) brauchen Build-Zeit →
deshalb diese zuerst nur als unsere ausgelieferten Premium-Module.

---
## Verteilung & Installation (Ergänzung)

### Auf der Landingpage einsehbar
Eine Seite **astoris.org/erweiterungen** listet alle verfügbaren Add-ons (Name, Icon,
Beschreibung, gratis/Premium) mit **Download-Link zum GitHub-Repo** des Add-ons.
Jedes Add-on lebt in einem eigenen (öffentlichen oder Premium-) Repo.

### Installation in der App: per Upload (kein Rebuild)
Im **„Erweiterungen"-Bereich** der App: Button **„Add-on hochladen"** → Nutzer wählt die
Add-on-Datei → App validiert, speichert sie unter `data/plugins/<id>/`, Add-on erscheint
sofort. Aktivieren/Deaktivieren per Schalter.

### 🔒 Sicherheit (zentral!)
**Nutzer-Uploads sind reine DATEN, KEIN ausführbarer Code.** Ein per Upload installierbares
Connector-Add-on ist ein **JSON-Manifest** (Felder, Berechtigungen, Test-Konfiguration), das
der vorhandene generische Handler interpretiert (HTTP-Ping etc.) — es kann den Server NICHT
kompromittieren. Beispiel:
```json
{
  "id": "my-api", "name": "Meine API", "type": "connector", "premium": false,
  "fields": [{"key":"base_url","label":"Endpoint","type":"url"},
             {"key":"api_key","label":"API-Schlüssel","type":"password","optional":true}],
  "scopes": [{"id":"use","label":"Nutzen","default":true}],
  "test": {"kind":"http","path":"/health","okStatus":200,"auth":"bearer"}
}
```
- **Code-Add-ons** (Agent-Tools, volle Apps) kommen **nur von uns** (signiert/vertrauenswürdig),
  nie per beliebigem Nutzer-Upload — so bleibt die Self-Hosting-Installation sicher.
- Upload-Validierung: striktes Schema, id-Format, Größenlimit, kein Pfad-Traversal.

### Folge für Phase 1
Connector-Add-ons werden **daten-getrieben** (JSON-Manifest) gebaut — dann ist „per Upload
integrieren" automatisch sicher, und der bestehende Verbindungstest-Handler wird generisch
erweitert, um Manifest-Connectors mitzutesten.

---
## Code-Add-ons + In-App-Editor (Ergänzung)

Add-ons können auch **als Code** eingefügt und **direkt in der App bearbeitet** werden
(eingebauter Editor) — die mächtige Profi-Variante neben den daten-getriebenen JSON-Connectors.

### Wie es läuft
- Ein Code-Add-on (`type: 'agent-tool'`) trägt ein `code`-Feld: JS, das `async function run(input)` definiert.
- Der Code läuft **server-seitig in einem eingeschränkten Sandbox-Kontext** (`node:vm`):
  nur `fetch`, `JSON`, `Math`, `Date`, `console` + `btoa`/`atob`/`crypto`/`TextEncoder`/`TextDecoder`/`URL`/`URLSearchParams` (Encoding/Hashing, keine I/O); **kein** `require`/`process`/`fs`/`child_process`.
  Mit **Timeout** (Standard 5 s).
- **In-App-Editor**: Code-Add-ons sind in „Erweiterungen" editierbar (Code anzeigen, ändern, speichern).

### 🔒 Sicherheit (ehrlich)
- `node:vm` ist **kein** vollständiger Sicherheits-Sandbox (theoretischer Ausbruch möglich).
  Für **Self-Hosting** (Betreiber führt eigenen Code aus) ist das vertretbar.
- Code-Add-ons aus **fremder Quelle** → **Warn-Dialog** vor Aktivierung. Nutzer bestätigt bewusst.
- JSON-Connector-Add-ons bleiben die empfohlene, sichere Standard-Variante für Uploads.
