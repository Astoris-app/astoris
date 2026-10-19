# Agentenlaufzeit und Betrieb

## Umgesetzter Stand

Astoris führt Modellaufrufe in persistenten Läufen aus. Die Oberfläche **Entscheidungen**
zeigt Laufstatus, konkrete Werkzeug-Eingaben, Freigaben, Ergebnisse und das Prüfprotokoll.
OpenAI-kompatible Modelle und Anthropic nutzen dieselbe serverseitige Werkzeug-Prüfung.

Ein Lauf durchläuft `queued → running → completed | failed | waiting_for_approval`.
Offene Freigaben können ausgeführt, abgelehnt oder zusammen mit dem Lauf abgebrochen werden.
Ein abgelehnter Aufruf ist ein dokumentierter Vorgang ohne Ausführung; der Lauf kann damit
abgeschlossen sein. `completed` bedeutet nicht, dass jede vorgeschlagene Aktion genehmigt wurde.

Die aktuelle Laufzeit arbeitet innerhalb des HTTP-Aufrufs. Sie ist noch keine verteilte
Hintergrund-Queue. Nach einer Freigabe wird die gespeicherte Aktion ausgeführt und ihr Ergebnis
im Laufprotokoll angezeigt. Eine weitere Modellrunde nach der Freigabe startet der Nutzer als
neue Nachricht; es gibt noch keine automatische Wiederaufnahme des Modell-Transkripts.

## Berechtigungen und Wiederholungen

Das Modell erhält eine Werkzeugliste. Ein tatsächlicher Aufruf wird erneut gegen genau diese
Liste geprüft. `undefined` verwendet den verfügbaren Katalog; eine explizit leere Liste `[]`
erlaubt **keine** Werkzeuge. Koordinator und Zusammenfassung einer Firmenaufgabe arbeiten
ohne Werkzeuge. Die externe Clawy-Engine wird für kontrollierte Läufe gesperrt, weil sie diese
Prüfungen und Freigaben nicht durch Astoris erzwingen lässt.

| Aktion | Regel |
| --- | --- |
| Kalender lesen | Ohne weitere Freigabe, sofern angeboten |
| Mail/Messenger entwerfen | Nur Entwurf; bestehende Versandbestätigung bleibt bestehen |
| Add-on vorschlagen | Installation bleibt separat zu bestätigen |
| Kalender anlegen/ändern, Autonomie 0–3 | Konkrete Eingabe bestätigen |
| Kalender anlegen/ändern, Autonomie 4–5 | Im erlaubten Werkzeugbereich direkt |
| Kalender löschen | Immer bestätigen |
| Code-Add-ons und MCP | Immer konkrete Eingabe bestätigen |

Freigaben gelten nur für die gespeicherten Eingaben und die zugehörige Werkzeugdefinition.
Ändern sich Add-on-Code, Konfiguration oder MCP-Verbindung, schlägt eine alte Freigabe fehl.
Die Entscheidung und der Start eines Aufrufs werden atomar beansprucht; eine zweite Freigabe
oder ein zweiter Start desselben Aufrufs wird verweigert.

Nach Beginn einer Werkzeugaktion gibt es keinen automatischen Modell-Retry oder Anbieterwechsel.
Das verhindert doppelte Nebenwirkungen nach Verbindungsfehlern. Bei einem Prozessneustart werden
unterbrochene Ausführungen als fehlgeschlagen markiert und **nicht** erneut ausgeführt.
Unberührte offene Freigaben bleiben erhalten. Eine externe Aktion kann vor einem Absturz bereits
gewirkt haben; daher das externe Ergebnis prüfen, bevor eine neue Aktion vorgeschlagen wird.

Dies ist eine At-most-once-Startgarantie pro Aufruf, keine verteilte Exactly-once-Garantie für
beliebige externe APIs. Bereits laufende Aktionen lassen sich nicht rückgängig abbrechen.

## Speicherung und Migration

Node.js **22.13 oder neuer** ist erforderlich. Die Anwendung verwendet das eingebaute
`node:sqlite`; unter Node 22 kann eine Experimental-Warnung erscheinen.

`data/runtime.sqlite` verwendet WAL, Fremdschlüssel und einen Busy-Timeout. Lauf- und
Werkzeug-Payloads sowie fachliche Dokumente werden mit dem vorhandenen AES-256-GCM-Schlüssel
verschlüsselt. IDs, Status, Firmenzuordnung, Benutzerzuordnung und Audit-Metadaten sind
für Indizes und Diagnose unverschlüsselt. Sitzungs-Tokens werden ausschließlich gehasht
gespeichert; Sitzungsinhalte sind verschlüsselt. Login-Sperren überleben Neustarts.

Beim ersten Zugriff werden diese JSON-Bestände einmalig übernommen:

- Firmenwissen, Ziele, Aufgaben und Agenten
- CRM, Kennzahlen, Optimierung und Marketing je Firma
- Kalender und Chatverläufe
- bestehende, noch gültige Sitzungen

Alte JSON-Dateien bleiben unverändert als Wiederherstellungsquelle erhalten. Nach dem Import
ist SQLite maßgeblich; manuelle Änderungen an den alten JSON-Dateien werden nicht erneut
eingelesen. Die Altdateien können weiterhin Klartext-Nutzdaten enthalten und gehören in den
geschützten Datenbereich. Verbindungen, Add-on-Manifeste, weitere Einstellungen und die
Firmen-Registry verwenden weiterhin ihre bisherigen Dateien.

Fachliche Dokumente besitzen eine Versionsnummer. Gleichzeitige Änderungen mit veraltetem
Stand werden verweigert, statt neuere Daten zu überschreiben. Jede Anfrage behält ihren
Firmenkontext über `await` hinweg; ein Firmenwechsel in einer anderen Anfrage verändert ihn nicht.

**Betriebsgrenze:** Ein Astoris-Anwendungsprozess pro Datenverzeichnis. SQLite schützt die
Transaktionen; eine prozessübergreifende Worker-Koordination und Lease-Verwaltung ist noch offen.

## MCP einrichten

Unter **Verbindungen → MCP-Server**:

1. Streamable-HTTP-URL und gegebenenfalls Bearer-Token eintragen.
2. Exakte erlaubte Tool-Namen kommagetrennt angeben.
3. „Ausgewählte MCP-Werkzeuge anbieten“ aktivieren und die Verbindung speichern.

Nur explizit ausgewählte Werkzeuge werden dem Modell angeboten. Jeder Aufruf geht durch die
normale Freigabe. Lokales HTTP auf Loopback ist möglich; entfernte Endpunkte benötigen HTTPS.
Metadata-/Link-Local-Adressen, URL-Zugangsdaten und HTTP-Weiterleitungen werden blockiert.
MCP-Server sind bewusst konfigurierte Vertrauenspartner. In dieser Ausbaustufe gibt es einen
MCP-Connector mit Bearer-Authentifizierung; OAuth, stdio und mehrere Server folgen separat.
Die Implementierung verwendet das [offizielle MCP-SDK](https://github.com/modelcontextprotocol/typescript-sdk/tree/v1.x).

## Add-on-Ausführung

Jeder Aufruf läuft in einem kurzlebigen Node-Unterprozess mit begrenztem Heap, leerer
Umgebung ohne Betreiber-Secrets, Node-Permissions ohne Datei-/Unterprozessfreigaben,
begrenzter Ausgabe und einem harten Prozess-Timeout. Auch endlose asynchrone Fortsetzungen
beenden damit nicht mehr den Webserver. Höchstens vier Add-on-Prozesse laufen gleichzeitig.
Normale `fetch`-Aufrufe werden über den Elternprozess mit SSRF-Prüfung und Größenlimits vermittelt.

Das verbessert Verfügbarkeit und begrenzt Schäden bei Fehlern. `node:vm` und Node-Permissions
sind weiterhin **keine ausreichende Grenze gegen absichtlich bösartigen Code**. Dafür fehlen
insbesondere eine vom Betriebssystem erzwungene Netzwerkisolation und stärkere Mandantentrennung.
Nur selbst erstellte oder geprüfte Add-ons betreiben. Ein öffentlicher Mehrnutzerbetrieb bleibt
bis zur Container-/MicroVM-Isolation und einem vollständigen Benutzer-/Rollenmodell offen.

## API und TypeScript-Client

Alle Endpunkte erfordern eine gültige Astoris-Sitzung. Läufe werden zusätzlich nach angemeldetem
Benutzer und aktiver Firma abgegrenzt; fremde Ressourcen ergeben 404.

| Methode und Pfad | Zweck |
| --- | --- |
| `GET /api/runs` | Letzte 50 Läufe im aktuellen Kontext |
| `POST /api/runs` | Nachricht als kontrollierten Lauf ausführen: `{ "message": "…" }` |
| `GET /api/runs/:id` | Lauf, Werkzeugaufrufe und Audit-Ereignisse |
| `POST /api/runs/:id` | `approve`/`reject` mit `callId`, oder `cancel` |

`sdk/astoris.ts` enthält einen Fetch-basierten Client ohne eigene Laufzeit-Abhängigkeiten:

```ts
import { AstorisClient } from './sdk/astoris.ts';

const client = new AstorisClient('https://astoris.example.org');
await client.login(process.env.ASTORIS_USER!, process.env.ASTORIS_PASSWORD!);
const answer = await client.send('Welche Termine stehen an?');
console.log(answer.reply);
const detail = await client.getRun(answer.runId);
// Eingaben prüfen, danach gezielt client.approve(runId, callId) aufrufen.
console.log(detail.calls);
await client.logout();
```

In Node wird das Sitzungscookie im Client gehalten. Im Browser nutzt der Client vorhandene
Cookies; dort die gleiche Origin wie die Anwendung verwenden. Mutationen werden niemals
automatisch wiederholt. API-Tokens und granulare SDK-Berechtigungen sind noch nicht implementiert.

## Prüfen und wiederherstellen

```bash
pnpm verify
```

Dies führt Tests, Svelte-/TypeScript-Prüfung, Produktionsbuild und einen isolierten Smoke-Test
des gebauten Servers aus. Der Smoke-Test prüft Anmeldung, Legacy-Import, Firmenwechsel,
Modell-Tool-Calling, eine über Neustart erhaltene Freigabe, doppelte Freigaben, Audit,
serverseitiges Rendering und Add-on-Ausführung. Er verwendet ausschließlich temporäre Daten
und einen lokalen Modell-Testserver. GitHub Actions führt dieselbe Prüfung aus.

Vor Updates die Anwendung stoppen und Quellcode, Konfiguration und das gesamte `data/`
sichern. Bei einer laufenden SQLite-Datenbank nicht nur `runtime.sqlite` kopieren: WAL/SHM
gehören zum aktiven Zustand. Für laufende Sicherungen die SQLite-Backup-API verwenden.
Der Master-Key bzw. dessen extern bereitgestellter Wert muss ebenfalls gesichert sein.

Für einen vollständigen Rollback Anwendung stoppen, aktuellen Zustand separat sichern und
Code, Daten und Schlüssel zusammen aus demselben Backup wiederherstellen. Nur den alten Code
zurückzusetzen würde neue SQLite-Änderungen nicht in die alten JSON-Dateien zurückübertragen.

## Weitere Ausbaustufen

- Wiederaufnahme vollständiger Modell-Transkripte und Worker-Queue mit Leases
- API-Tokens, Benutzer-/Rollenverwaltung und OIDC
- Vom Betriebssystem isolierte Add-ons mit Netzwerkregeln
- Mehrere MCP-Server, OAuth und stdio
- Restliche Datei-Stores migrieren; Export- und Restore-Werkzeuge für aktuelle SQLite-Daten

Diese Punkte sind durch die vorhandene Grundlage vorbereitet, aber noch nicht implementiert.
