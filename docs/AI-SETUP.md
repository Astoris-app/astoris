# Mit KI einrichten und externe Agenten anbinden

## Direkt in Astoris

1. Einmalig Benutzer/Login und mindestens eine Modell-Verbindung einrichten.
2. **Technik → Einrichtung** (`/einrichten`) öffnen. Die klassische Tour bleibt
   über **Klassische Einrichtung öffnen** erreichbar.
3. Firma und Ziele beschreiben. Beschreibung, Antworten und der angezeigte
   Firmenkontext gehen an das ausgewählte Modell; keine Zugangsdaten einfügen.
4. Rückfragen beantworten und den Vorschlag prüfen. **Plan übernehmen** wird erst
   nach Ankreuzen der ausdrücklichen Freigabe aktiv.

Die erste Version verändert Name, Branche und Mission der **aktiven** Firma und
ergänzt Rollen/Agenten und Ziele. Bestehende Daten bleiben erhalten; gleiche Titel
werden nicht doppelt angelegt. Neue Agenten erhalten Autonomie 1 und eine leere
Tool-Allowlist. Verbindungen werden nur empfohlen; Zugangsdaten und Rechte setzt
der Betreiber unter **Verbindungen**. Es werden keine Nachrichten verschickt,
Add-ons installiert, Cloud-Konten angelegt oder Servereinstellungen verändert.

Pläne sind 24 Stunden gültig, verschlüsselt gespeichert und an Firma und Betreiber
gebunden. Änderungen am Firmendokument seit der Vorschlagserstellung führen zu
HTTP 409 statt Überschreiben. Firmendokument, Planstatus, verschlüsselter Vorzustand
und Audit-Ereignis werden beim Übernehmen in **einer SQLite-Transaktion** gespeichert.
Erneute Übernahme desselben Plans ist idempotent. Der Anzeigename in der älteren
JSON-Firmenliste wird danach separat synchronisiert; ein Fehler erzeugt eine Warnung.

Planung erfolgt über die vorhandene Modell-Engine mit **keinen Werkzeugen** und
Autonomie 0. Modellantworten werden strikt validiert. Ohne erreichbares Modell
oder bei ungültiger Antwort wird kein vermeintlicher Erfolgsplan erzeugt. Nach
einer Korrektur des Briefings einen neuen Plan anfordern; gespeicherte Pläne sind
absichtlich nicht nachträglich veränderbar.

## Codex / Claude Code als externer Steuerungsclient

Im Abschnitt **Codex / Claude Code anbinden** einen benannten Zugang erstellen.
Er ist an die aktuelle Firma und den ausstellenden Betreiber gebunden und gilt
1, 7 oder 30 Tage (serverseitiges Maximum: 30). Standardmäßig sind nur
`setup:read` und `setup:propose` ausgewählt. Der Token wird **einmal** angezeigt;
SQLite speichert nur seinen SHA-256-Hash und verschlüsselte Zugangsmetadaten.

Der Streamable-HTTP-Endpunkt lautet:

```text
https://DEINE-ASTORIS-DOMAIN/api/agent/mcp
```

### Codex

Die in Astoris angezeigte Konfiguration in die eigene Codex-Konfiguration übernehmen:

```toml
[mcp_servers.astoris]
url = "https://DEINE-ASTORIS-DOMAIN/api/agent/mcp"
bearer_token_env_var = "ASTORIS_AGENT_TOKEN"
tool_timeout_sec = 180
```

Den einmal angezeigten Zugangswert über den eigenen Secret-Manager oder eine
geschützte Prozessumgebung als `ASTORIS_AGENT_TOKEN` bereitstellen. Nicht in
Chat-Nachrichten, Git-Dateien, öffentliche Screenshots oder Shell-History kopieren.
Codex neu starten und die Verbindung mit `/mcp` prüfen. Die eigene Codex-/Modell-
Authentifizierung bleibt davon getrennt; der Astoris-Token ist kein OpenAI-Schlüssel.

Referenz: [offizielle Codex-MCP-Konfiguration](https://developers.openai.com/codex/mcp).

### Andere MCP-Clients, einschließlich Claude Code

Den gleichen Endpunkt als **Streamable HTTP** mit dem Header
`Authorization: Bearer <Astoris-Zugang>` konfigurieren. Für die Ablage des Headers
die Secret-/Umgebungsvariablen-Funktion des jeweiligen Clients nutzen. Auf Protokollebene
ist die Integration mit dem offiziellen TypeScript-MCP-Client getestet; spezifische
Client-Oberflächen und ein OAuth-Anmeldedialog sind nicht Bestandteil dieser Version.

### Werkzeuge und Rechte

| Scope | MCP-Werkzeug | Wirkung |
|---|---|---|
| `setup:read` | `astoris_setup_context` | Begrenztes Firmenprofil, Rollen/Ziele, Connector-Katalog und Dokumentversion lesen |
| `setup:propose` | `astoris_propose_setup` | Plan mit gelesener `baseVersion` zur menschlichen Prüfung speichern |
| `runs:read` | `astoris_list_runs`, `astoris_get_run` | Eigene Läufe dieser Firma samt Ergebnissen und Audit lesen |
| `runs:create` | `astoris_send_message` | Aufgabe an Astoris' eingerichtetes Modell senden, fest mit Autonomie 1 |

Ein externer Agent kann ohne Astoris-Modell einen strukturierten Einrichtungsplan
vorschlagen. Nur die integrierte KI-Planung und `astoris_send_message` benötigen
ein in Astoris konfiguriertes Modell; diese Aufrufe können Anbieter-Kosten erzeugen.
Die Freigabe erfolgt anschließend angemeldet unter `/einrichten` beziehungsweise
für Werkzeugaufrufe unter `/entscheidungen`. **Kein MCP-Werkzeug kann Pläne oder
Tool-Aufrufe freigeben, Tokens verwalten, Verbindungen verändern oder Firmen wechseln.**

Das ist eine private API-Key-/Bearer-Anbindung, kein OAuth und kein automatisch
veröffentlichter Plugin-Marktplatz-Eintrag. Zugänge gelten ausschließlich für den
MCP-Endpunkt; sie ersetzen keine Browser-Sitzung und funktionieren nicht an den
übrigen REST-APIs oder im vorhandenen sitzungsbasierten TypeScript-Client.

## Betrieb und Sicherheit

- Nur über HTTPS oder einen geschützten lokalen Kanal verwenden. Betreiber muss
  weiterhin gültiger Passwort-Benutzer oder freigegebene Tailscale-Identität sein.
- Widerruf/Fristablauf wird bei neuen Anfragen und jedem Tool-Aufruf geprüft;
  eine bereits gestartete Aktion wird dadurch nicht nachträglich rückgängig gemacht.
- Maximal 32 KiB pro JSON-/MCP-Anfrage. Persistente Minutenlimits: fünf KI-Planungen
  pro Betreiber, fünf Token-Ausstellungen pro Betreiber, 60 MCP-Anfragen pro Zugang,
  zehn externe Vorschläge und fünf Modellaufträge pro Zugang.
- Profiländerungen, Token-Ausstellung/-Widerruf und MCP-Aufrufe werden als
  Metadaten protokolliert; Token-Geheimnisse werden nicht im Audit abgelegt.
- Sicherung umfasst weiterhin Datenverzeichnis **und** Master-Key. Der verschlüsselte
  Vorzustand eines übernommenen Plans liegt im Plan-Payload der Tabelle `setup_plans`;
  ein automatischer Rollback-Button ist nicht implementiert. Es gelten die
  [SQLite-Backup-Hinweise](RUNTIME.md#prüfen-und-wiederherstellen).
- Die übrigen Grenzen der Runtime (ein Prozess pro Datenverzeichnis, keine gehärtete
  Mehrmandanten-Isolation, keine automatische Chat-Fortsetzung nach Freigaben)
  bleiben bestehen.

## Prüfen

`pnpm verify` prüft Planvalidierung, Konflikte, atomaren Rollback, Rechte, Ablauf und
Widerruf, einen echten MCP-SDK-Client sowie den Produktionsablauf mit isoliertem
Fake-Modell: planen → Neustart → menschlich übernehmen → nicht doppelt anwenden,
firmengebundener externer Vorschlag → Konflikt nach Änderung → Token widerrufen.
Dabei werden weder echte Cloud-Kosten noch Änderungen an Firmendaten ausgelöst.
