# Astoris-Handbuch: vom ersten Start zum täglichen Betrieb

Dieses Handbuch beschreibt den aktuellen Funktionsumfang von Astoris. Es richtet
sich zuerst an Anwender und anschließend an Betreiber einer eigenen Installation.
Die Menübezeichnungen beziehen sich auf die deutsche Oberfläche.

Alle Beispiele sind fiktiv. `https://astoris.example.org`, `DEIN_BENUTZERNAME` und
`MODELLSERVER` sind Platzhalter, keine echten Zugänge. Interne Adressen,
persönliche Angaben, Passwörter und Schlüssel gehören nicht in dieses Handbuch.

## Inhalt

1. [Der schnellste Einstieg nach der Installation](#1-der-schnellste-einstieg-nach-der-installation)
2. [Starten und Erreichbarkeit prüfen](#2-starten-und-erreichbarkeit-prüfen)
3. [Anmelden und den Erstzugang einrichten](#3-anmelden-und-den-erstzugang-einrichten)
4. [Die Einführung abschließen](#4-die-einführung-abschließen)
5. [Ein KI-Modell verbinden](#5-ein-ki-modell-verbinden)
6. [Die Firma mit KI einrichten](#6-die-firma-mit-ki-einrichten)
7. [Die Oberfläche verstehen](#7-die-oberfläche-verstehen)
8. [Mit dem Assistenten arbeiten](#8-mit-dem-assistenten-arbeiten)
9. [Team, Ziele und Werkzeuge einrichten](#9-team-ziele-und-werkzeuge-einrichten)
10. [Freigaben richtig bearbeiten](#10-freigaben-richtig-bearbeiten)
11. [Weitere Arbeitsbereiche nutzen](#11-weitere-arbeitsbereiche-nutzen)
12. [Externe Agenten und MCP](#12-externe-agenten-und-mcp)
13. [Sicherheit und Datenschutz](#13-sicherheit-und-datenschutz)
14. [Sichern, aktualisieren und wiederherstellen](#14-sichern-aktualisieren-und-wiederherstellen)
15. [Probleme systematisch beheben](#15-probleme-systematisch-beheben)
16. [Checkliste für den ersten Arbeitstag](#16-checkliste-für-den-ersten-arbeitstag)

## 1. Der schnellste Einstieg nach der Installation

Ist Astoris bereits gestartet und eingerichtet, brauchst du kein Terminal:

1. Öffne die vom Betreiber mitgeteilte Astoris-Adresse im Browser.
2. Verbinde dein Gerät gegebenenfalls mit dem vorgesehenen privaten Netzwerk.
3. Melde dich mit deinem Astoris-Zugang an.
4. Öffne **Technik → Verbindungen**.
5. Prüfe, ob eine KI-Verbindung eingerichtet ist. Wenn ja, ändere sie nicht ohne
   Grund; bei einer betreuten Installation kann sie bereits vollständig vorbereitet sein.
6. Öffne **Arbeitsplatz → Assistent** und sende die Testnachricht aus Abschnitt 8.
7. Möchtest du eine Firma aufbauen, öffne **Technik → Einrichtung** und folge Abschnitt 6.
8. Kontrolliere anschließend **Leitung → Team** und **Leitung → Entscheidungen**.

Erfolgskriterium: Du kannst dich anmelden, eine echte Modellantwort erhalten und
einen Vorschlag prüfen, ohne ungewollt Nachrichten zu versenden oder Daten zu ändern.

Astoris und das KI-Modell sind zwei verschiedene Dienste. Eine erreichbare
Astoris-Oberfläche beweist noch nicht, dass ein Modell angeschlossen ist.

## 2. Starten und Erreichbarkeit prüfen

### 2.1 Welche Startart gehört zu deiner Installation?

| Installation | Wer startet? | Was ist zu tun? |
| --- | --- | --- |
| Bereits bereitgestellte Instanz | Betreiber | Browseradresse öffnen; nicht zusätzlich eine zweite Instanz starten |
| Docker Compose aus diesem Repository | Betreiber | Befehle in Abschnitt 2.2 im Projektverzeichnis ausführen |
| Node.js direkt | Betreiber | Abschnitt 2.3 verwenden |
| Dokploy oder anderer Container-Verwalter | Betreiber | Die konkrete Astoris-Anwendung starten; nicht den gesamten gemeinsamen Server neu starten |

Die Standard-Compose-Datei dieses Repositorys nennt den Anwendungsdienst
`astoris`. Angepasste Installationen können andere Dateinamen, Dienstnamen,
Ports und Proxys verwenden. Die folgenden Compose-Befehle gelten für die
Standarddatei `docker-compose.yml`; nicht ungeprüft auf fremde Stacks übertragen.

### 2.2 Docker Compose

Öffne ein Terminal im bereits eingerichteten Astoris-Projektverzeichnis. Dort
müssen `docker-compose.yml`, `Dockerfile` und die private Konfiguration vorhanden sein.

```bash
docker compose config --quiet
docker compose up -d --build
docker compose ps
```

`config --quiet` prüft die Konfiguration, ohne ihre möglicherweise geheimen Werte
auszugeben. Beim ersten Start benötigt der Image-Build etwas Zeit.

Wenn die Container bereits erstellt sind und nur angehalten wurden:

```bash
docker compose start
docker compose ps
```

Bei Problemen nur die letzten Meldungen ansehen:

```bash
docker compose logs --tail=100 astoris
docker compose logs --tail=100 caddy
```

Die Standardinstallation verwendet Caddy als HTTPS-Reverse-Proxy. Öffne die
konfigurierte HTTPS-Adresse, nicht den internen Container-Port. In `.env` muss
`ASTORIS_ORIGIN` exakt zur Browseradresse einschließlich eines abweichenden Ports
passen. `ASTORIS_DOMAIN` ist die zugehörige Caddy-Site-Adresse.

Eine `.ts.net`-Adresse allein richtet noch keinen Tailscale-Zugang und kein
funktionierendes Caddy-Zertifikat ein. Der Betreiber muss den privaten HTTPS-Proxy
gesondert konfigurieren. Bestehende Proxy- oder Tailscale-Routen nicht überschreiben.

Anhalten ohne Löschen der persistenten Daten:

```bash
docker compose stop
```

**Nicht als normale Stop-Funktion verwenden:** `docker compose down --volumes`.
Dieser Befehl kann die benannten Daten-Volumes der Installation entfernen.

### 2.3 Node.js ohne Docker

Voraussetzung: Node.js ab der in `package.json` angegebenen Mindestversion
(derzeit 22.13) und die dort festgelegte pnpm-Version.

Für lokale Entwicklung:

```bash
pnpm install --frozen-lockfile
pnpm run dev -- --host 127.0.0.1 --port 5180
```

Ohne konfigurierte Entwicklungszertifikate ist der lokale Aufruf
`http://localhost:5180`. Sind passende Zertifikate eingerichtet, verwendet der
Entwicklungsserver HTTPS. Nicht allein vom Port auf das Protokoll schließen.
Das explizite Loopback-Binding verhindert eine unbeabsichtigte LAN-Freigabe.

Für den gebauten Server hinter einem bereits eingerichteten HTTPS-Proxy:

```bash
pnpm install --frozen-lockfile
pnpm run build
NODE_ENV=production HOST=127.0.0.1 PORT=3000 ORIGIN=https://astoris.example.org node --env-file=.env build
```

Ersetze die Beispiel-Origin durch deine tatsächliche Browseradresse. Die private
`.env` muss existieren. Der Produktionsserver lädt sie nicht wie der
Entwicklungsserver automatisch; `--env-file=.env` lädt sie ausdrücklich.
Der Node-Server spricht hier intern HTTP. HTTPS übernimmt der vorgeschaltete Proxy,
nicht das bloße Vorhandensein von Dateien im Verzeichnis `certs/`.

`Strg+C` beendet einen im Terminal gestarteten Prozess. Für dauerhaften Betrieb
einen verwalteten Dienst verwenden; ein geschlossenes Terminal ist kein
verlässlicher Prozessmanager. Nicht gleichzeitig Entwicklungs- und
Produktionsserver mit demselben Datenverzeichnis betreiben.

### 2.4 Zugriff über ein privates Netzwerk

Wenn der Betreiber eine private Adresse bereitgestellt hat:

1. Den vorgesehenen Netzwerk-Client auf dem zugreifenden Gerät starten.
2. Mit dem richtigen Netzwerk beziehungsweise Tailnet verbinden.
3. Prüfen, ob das Gerät für den Dienst freigegeben ist.
4. Die vollständige Adresse einschließlich HTTPS und gegebenenfalls Port öffnen.
5. Bei Nichterreichbarkeit zunächst Netzwerk und Dienststatus prüfen.

Privater Netzwerkzugriff ersetzt nicht automatisch die Astoris-Anmeldung.
Insbesondere erkennt ein Container hinter einem Proxy nicht zwingend deine
Tailscale-Identität. Passwort-Login bleibt dann der vorgesehene Weg.

## 3. Anmelden und den Erstzugang einrichten

### 3.1 Eine vorhandene Installation verwenden

1. Öffne die Instanzadresse. Bei Bedarf ergänze `/login`.
2. Gib den vom Betreiber eingerichteten Benutzernamen ein.
3. Gib das zugehörige Passwort ein und melde dich an.
4. Verwende einen Passwortmanager zum sicheren Aufbewahren des Zugangs.

Es gibt kein allgemeines Astoris-Standardpasswort. Ein vom Betreiber bei der
Bereitstellung erzeugtes Passwort steht nicht im öffentlichen Repository oder
in diesem Handbuch. Fordere es über einen geschützten Übermittlungsweg an.

### 3.2 Eine wirklich neue Installation einrichten

Bei einer neuen Installation erscheint zuerst die Zugangseinrichtung unter
`/login`. Auch ein direkter Aufruf von `/welcome` führt ohne Anmeldung zuerst
dorthin. Nach erfolgreichem Erstzugang öffnet sich die Einführung automatisch.
Ein vorhandener Zugang wird regulär angemeldet, nicht erneut angelegt.

Wenn noch kein Zugang konfiguriert ist:

1. Öffne `/login` in der vom Betreiber abgesicherten Erstzugangsumgebung.
2. Lege einen Benutzernamen mit mindestens drei Zeichen fest.
3. Wähle ein einzigartiges, langes Passwort; technisch werden mindestens acht
   Zeichen verlangt. Nutze möglichst ein vom Passwortmanager erzeugtes Passwort.
4. Wiederhole es und schließe die Zugangseinrichtung ab.
5. Speichere den Zugang im Passwortmanager, nicht in Projektdateien.

Erstzugänge sind serverseitig eingeschränkt: lokal, mit erkannter
Tailscale-Identität oder mit einem gültigen Setup-Token. Ein Browser auf
demselben Rechner gilt hinter einem Container-Proxy nicht zwingend als lokaler
Client. Eine Ablehnung ist deshalb nicht automatisch ein falsches Passwort.

Bei einem Proxy-Erstsetup kann der Betreiber `ASTORIS_SETUP_TOKEN` als privates
Server-Secret bereitstellen. Öffne auf der Login-Seite **Einrichtung über einen
Reverse-Proxy?** und trage den sicher übermittelten Wert unter
**Einrichtungs-Token (optional)** ein. Das ist kein KI-Anbieter-Schlüssel.
Nur beim ersten Anlegen eines Zugangs wird dieser Wert benötigt; er ersetzt
nicht das später gewählte Login-Passwort. Ohne lokalen Zugang, erkannte Identität
oder passenden Token bleibt die Erstzugangssperre aktiv.

Alternativ kann der Betreiber den Zugang über den lokalen Kanal im folgenden
Abschnitt anlegen. Niemals zur Umgehung der Sperre Authentifizierungsdaten löschen.

### 3.3 Betreiber: Erstzugang im Standard-Docker-Container

Nur für eine bisher unkonfigurierte, eigene Installation und nur auf einem
vertrauenswürdigen Administrationsrechner. Dieser Weg überschreibt keinen
bestehenden Zugang. Die Anwendung muss bereits laufen.

Führe den folgenden Block in **Bash** aus. Ersetze zuvor ausschließlich
`DEIN_BENUTZERNAME` im Code. Das Passwort wird verdeckt abgefragt und über
Standardeingabe übermittelt, nicht als Befehlsargument oder Klartext im Verlauf.
Shell-Debugging beziehungsweise `set -x` muss dabei ausgeschaltet sein.

```bash
read -r -s -p 'Neues Astoris-Passwort: ' astoris_bootstrap_pw
printf '\n'
printf '%s' "$astoris_bootstrap_pw" | docker compose exec -T astoris node --input-type=module -e '
let value = "";
for await (const chunk of process.stdin) value += chunk;
const response = await fetch("http://127.0.0.1:3000/api/auth", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ action: "set-password", username: "DEIN_BENUTZERNAME", password: value })
});
const result = await response.json();
console.log(response.ok && result.ok ? "Erstzugang eingerichtet." : "Erstzugang abgelehnt: " + (result.error ?? response.status));
process.exitCode = response.ok && result.ok ? 0 : 1;
'
unset astoris_bootstrap_pw
```

Danach im Browser mit dem neuen Zugang anmelden. Für eine angepasste Installation
Dienstname und internen Port vorher prüfen. Dies ist kein Passwort-Reset für
bestehende Konten und kein Anlass, `data/auth.json` zu löschen.

### 3.4 Tailscale-Anmeldung und Passwortänderung

Eine angebotene Tailscale-Anmeldung nur verwenden, wenn die angezeigte Identität
stimmt und sie freigegeben ist. Dass die Adresse über Tailscale erreichbar ist,
garantiert diesen Anmeldeknopf nicht.

Ein vorhandenes Passwort lässt sich unter **Technik → Einstellungen** mit dem
aktuellen und einem neuen Passwort ändern. Bestehende Sitzungen dieses Benutzers
werden dabei beendet; die ändernde Sitzung wird neu ausgestellt.

Bei verlorenem Passwort den Betreiber kontaktieren. Es gibt derzeit keinen
allgemeinen „Passwort vergessen“-E-Mail-Ablauf. Alte Passwörter lassen sich aus
dem gespeicherten Passwort-Hash nicht auslesen.

## 4. Die Einführung abschließen

Die klassische Einführung führt durch folgende Bereiche:

1. Begrüßung und Funktionsübersicht.
2. Profilwahl **Persönlich** oder **Firma**.
3. Beim Firmenprofil: Firmenname, Branche, Mission sowie optional Wissen, Ziele
   und eine Branchenvorlage für Rollen.
4. KI-Modell: Cloud-Anbieter oder lokaler beziehungsweise kompatibler Endpoint.
5. Optionales E-Mail-Postfach.
6. Weitere Konten und Öffnen des Workspace.

Du darfst optionale Verbindungen überspringen und später ergänzen. Eine
übersprungene Modellverbindung bedeutet aber, dass noch keine echte KI-Antwort
bereitsteht. Der Login ist zu diesem Zeitpunkt bereits eingerichtet. Firmen-
und Kontenänderungen sind auch während der Einführung nur angemeldet möglich.

Die Einführung später erneut ansehen: **Technik → Einrichtung → Klassische
Einrichtung öffnen**. Die wiederholte Tour setzt den Einrichtungsstatus nicht
zurück; ausdrücklich gespeicherte Verbindungen können dennoch geändert werden.

## 5. Ein KI-Modell verbinden

### 5.1 Lokales oder OpenAI-kompatibles Modell

1. Öffne **Technik → Verbindungen** (`/connections`).
2. Öffne den Connector **KI-Modelle**.
3. Trage unter **Endpoint** die vom Betreiber bereitgestellte Basisadresse ein.
4. Ergänze den API-Schlüssel nur, wenn der Modellserver ihn verlangt.
5. Erlaube **Als Modell verwenden**.
6. Teste die Verbindung und speichere sie nach erfolgreichem Test.
7. Wähle unter **Einstellungen** die lokale KI-Quelle, wenn sie bevorzugt werden soll.
8. Prüfe die Antwort im Assistenten.

Beispiel einer ausdrücklich fiktiven Basisadresse:

```text
http://MODELLSERVER:8000
```

Die App ergänzt `/v1/models` und `/v1/chat/completions` selbst. Nicht zusätzlich
`/v1` an die Basisadresse hängen, sofern nicht eine bewusst abweichende
Proxy-Basis vereinbart wurde. „Lokal/kompatibel“ bezeichnet das API-Format:
ein dort eingetragener externer Anbieter ist dadurch nicht automatisch privat
oder lokal auf deiner Hardware.

**Der häufigste Containerfehler:** `localhost` im Astoris-Container meint den
Astoris-Container selbst, nicht den Host und nicht einen anderen Modellcontainer.
Verwende einen vom Betreiber konfigurierten Dienstnamen oder Gateway. Nicht zur
Fehlersuche den gesamten Container privilegieren oder auf Host-Netzwerk umstellen.

### 5.2 Cloud-KI

1. Öffne unter **Verbindungen** den Connector **Cloud-KI**.
2. Wähle den unterstützten Anbieter passend zu deinem Zugang.
3. Trage dessen API-Schlüssel nur in das dafür vorgesehene geheime Feld ein.
4. Teste und speichere die Verbindung.
5. Wähle die gewünschte KI-Quelle beziehungsweise das angebotene Modell.
6. Sende zunächst nur eine unkritische Testnachricht.

Ein Chat-Abonnement und API-Zugriff sind nicht dasselbe. Die App braucht einen
für den gewählten API-Anbieter gültigen Zugang. Verfügbarkeit, Nutzungsgrenzen
und Kosten klärst du beim jeweiligen Anbieter; das Handbuch verspricht keine
kostenlose oder unbegrenzte Nutzung.

Bei Cloud-Nutzung verlassen die übermittelten Inhalte die eigene Maschine.
Auch Modellaufrufe durch Agenten und KI-Einrichtung können Kosten verursachen.

### 5.3 Was „verbunden“ tatsächlich bestätigt

Ein erfolgreicher Verbindungstest bestätigt die geprüfte Erreichbarkeit und
Authentifizierung. Er garantiert nicht jedes spätere Modellverhalten, korrekte
Werkzeugaufrufe oder ausreichende Kapazität unter Last. Prüfe daher zusätzlich
eine echte Antwort. Ein Engine-Status allein ist noch kein vollständiger Test.

Bei einem eingerichteten, aber ausgefallenen lokalen Modell meldet Astoris den
Fehler; es soll nicht unbemerkt auf die externe Clawy-Engine wechseln.
Für kontrollierte Werkzeugläufe ist eine direkte Modellverbindung erforderlich.

Eine ausdrückliche Modellwahl für einen Chat oder Agenten kann die globale
Quellenpräferenz übersteuern. Prüfe bei unerwarteter Modellnutzung deshalb
sowohl die Einstellungen als auch die konkrete Modellwahl des Arbeitsbereichs.

## 6. Die Firma mit KI einrichten

### 6.1 Vorbereiten

1. Melde dich an.
2. Prüfe die **aktive Firma** im Firmenumschalter. Alle folgenden Vorschläge
   beziehen sich auf diese Firma.
3. Verbinde mindestens ein erreichbares KI-Modell.
4. Öffne **Technik → Einrichtung** (`/einrichten`).
5. Kontrolliere den angezeigten aktuellen Firmenkontext.

Die Anzeige **Modell eingerichtet** bedeutet, dass eine erfolgreich getestete
Modellverbindung gespeichert ist; sie ist kein ständiger Verfügbarkeitsnachweis.
Bei **Noch kein Modell eingerichtet** folge **KI-Modell einrichten**. Der Link
führt direkt zum Modellbereich der Verbindungen. Solange diese Voraussetzung
fehlt, ist die Planerstellung gesperrt. Extern eingereichte Pläne bleiben prüfbar.

Die KI erhält die Beschreibung, deine Antworten sowie den aufbereiteten
Firmenkontext einschließlich Profil, Rollen und Zielen. Nenne keine Passwörter,
Tokens, echten Kundendaten oder vertraulichen Unterlagen im Einrichtungsbriefing.

### 6.2 Einen Vorschlag anfordern

Trage unter **Was möchtest du aufbauen?** beispielsweise Folgendes ein:

> Dies ist eine fiktive Testfirma für digitale Dienstleistungen. Sie unterstützt
> kleine Unternehmen bei der Organisation. Ich brauche die Rollen Kundenservice
> und Projektkoordination. Ziele für den ersten Monat: einen klaren Anfrageablauf
> beschreiben und eine interne Aufgabenübersicht aufbauen. Bitte nur einen
> überschaubaren Vorschlag erstellen; keine Nachrichten senden.

1. Klicke **Plan vorschlagen lassen**.
2. Beantworte gegebenenfalls die angezeigten Rückfragen unter **Deine Antworten**.
3. Fordere mit diesen Ergänzungen den Vorschlag erneut an.
4. Warte auf den geprüften Plan oder eine ausdrückliche Fehlermeldung.

Nach Rückfragen erhält das Antwortfeld den Fokus. Ein fertiger Plan wird
angekündigt und zur Prüfung in den sichtbaren Bereich geführt.

Die Planungsphase verfügt über keine Werkzeuge. Sie richtet keine Cloud-Konten
ein und führt keine Befehle auf dem Server aus.

### 6.3 Prüfen und bewusst übernehmen

Lies den gesamten Plan:

- Stimmen Firmenname, Branche und Mission?
- Sind Rollen und Ziele sinnvoll, verständlich und nicht zu umfangreich?
- Sind empfohlene Verbindungen notwendig?
- Ist die richtige Firma ausgewählt?

Erst danach:

1. Setze das Häkchen **Ich habe das vorgeschlagene Profil und die Ergänzungen
   geprüft und gebe genau diesen Plan frei.**
2. Klicke **Plan übernehmen**.
3. Kontrolliere den Status **Übernommen**.
4. Prüfe Profil, Rollen und Ziele unter **Team** beziehungsweise **Cockpit**.

Nach erfolgreicher Übernahme führen **Team prüfen** und **Cockpit öffnen**
direkt zu diesen nächsten Schritten.

Ohne Häkchen bleibt die Übernahme gesperrt. Mit **Verwerfen** lehnst du den Plan
ab. Ein gespeicherter Plan ist nicht nachträglich editierbar: Bei Änderungswünschen
einen neuen Vorschlag erzeugen und den alten verwerfen.

### 6.4 Welche Änderungen sind erlaubt?

Die Übernahme ändert Firmenname, Branche und Mission und ergänzt Rollen mit
Agenten sowie Ziele. Vorhandene Rollen, Agenten und Ziele bleiben erhalten;
übereinstimmende Titel werden nicht doppelt angelegt. Neue Agenten starten mit
**Autonomie 1 und ohne Werkzeuge**.

Empfohlene Verbindungen sind nur Empfehlungen. Zugangsdaten, Berechtigungen und
Installation von Erweiterungen sind weitere, getrennte Schritte. Ein übernommener
Plan macht die Firma nicht zu einem unbeaufsichtigt arbeitenden Hintergrunddienst.

Pläne gelten 24 Stunden. Wurde die Firma seit Erstellung geändert, kann die
Übernahme mit einem Versionskonflikt scheitern. Dann **Neu laden**, den aktuellen
Stand prüfen und einen neuen Plan erstellen. Es gibt keinen automatischen
Rollback-Knopf für einen bereits übernommenen Plan; vorher ein Backup vorsehen.

Vertiefung: [KI-Einrichtung und externe Agenten](AI-SETUP.md).

## 7. Die Oberfläche verstehen

Astoris gruppiert die Arbeitsbereiche wie Etagen eines Firmengebäudes:

| Bereich | Wichtige Seiten | Zweck |
| --- | --- | --- |
| Eingang | Übersicht | Einstieg und Statusüberblick |
| Leitung | Cockpit, Team, Optimierung, Entscheidungen | Firma, Ziele, Agenten und Freigaben |
| Wachstum | CRM, Marketing, Kennzahlen, Recherche | Kundenarbeit, Inhalte, Messwerte und Recherche |
| Arbeitsplatz | Assistent, Posteingang, Kalender, Dokumente, Studio, Anrufe | Tägliche Arbeit |
| Technik | Verbindungen, Erweiterungen, Tresor, Einstellungen, Einrichtung | Anbindungen, Sicherheit und Konfiguration |

Wichtige direkte Pfade relativ zu deiner eigenen Instanzadresse:

| Pfad | Seite |
| --- | --- |
| `/` | Assistent |
| `/einrichten` | KI-Einrichtung und externe Agentenzugänge |
| `/connections` | Verbindungen |
| `/agents` | Team |
| `/firma` | Cockpit |
| `/entscheidungen` | Aufgabenentscheidungen und Werkzeug-Freigaben |
| `/settings` | Einstellungen |
| `/login` | Anmeldung |

Bei schmalen Bildschirmen gegebenenfalls zuerst die Navigation öffnen. Sprache,
Hell-/Dunkelmodus und Schriftgröße kannst du unter **Einstellungen** anpassen.

Mehrere Firmen sind Arbeitskontexte, keine vollständig abgeschotteten
Mehrbenutzer-Mandanten. Nicht annehmen, dass alle Verbindungen und Einstellungen
je Firma getrennt sind. Vor Änderungen immer den aktuellen Kontext kontrollieren.

## 8. Mit dem Assistenten arbeiten

### 8.1 Die erste Nachricht

1. Öffne **Arbeitsplatz → Assistent**.
2. Prüfe, welche KI-Quelle ausgewählt ist.
3. Sende zunächst eine Nachricht ohne personenbezogene Inhalte:

> Erkläre mir in drei kurzen Punkten, wie du mich bei der Organisation unterstützen
> kannst. Führe keine Werkzeuge aus und ändere keine Daten.

4. Prüfe, ob eine echte Modellantwort erscheint oder eine Meldung über ein
   fehlendes beziehungsweise nicht erreichbares Modell.
5. Bei Fehlern nicht mehrfach schnell hintereinander senden; erst Abschnitt 15 prüfen.

### 8.2 Gute Aufträge formulieren

Nenne Ziel, benötigten Kontext, gewünschtes Ergebnis und Grenzen. Zum Beispiel:

> Erstelle eine Checkliste für die Bearbeitung einer fiktiven Kundenanfrage.
> Das Ergebnis soll fünf Punkte enthalten. Nur Text entwerfen; keine E-Mail
> senden, keinen Kontakt anlegen und keine externen Dienste aufrufen.

„Schreibe einen Entwurf“ ist etwas anderes als „Sende diese Nachricht“.
Eine KI-Aussage wie „erledigt“ ist kein Ausführungsnachweis: Prüfe bei Aktionen
den tatsächlichen Werkzeugstatus und gegebenenfalls das Ergebnis im Zielsystem.

### 8.3 Spracheingabe und Browserfunktionen

Mikrofonzugriff benötigt Browserfreigabe und einen sicheren Kontext, normalerweise
HTTPS. Wo angeboten, kannst du die Leertaste zum Diktieren halten; Bedienung und
Verfügbarkeit hängen vom Eingabefeld und Browser ab. Eine Texteingabe bleibt
immer der einfachere erste Funktionstest.

## 9. Team, Ziele und Werkzeuge einrichten

1. Öffne **Leitung → Team**.
2. Wechsle zum Firmenbereich, wenn zunächst die Persönlichkeiten angezeigt werden.
3. Prüfe Firmenprofil und Rollen.
4. Öffne den gewünschten Agenten und beschreibe seine Aufgabe möglichst eng.
5. Beginne mit einem niedrigen Autonomie-Level.
6. Schalte nur die tatsächlich benötigten Werkzeuge frei.
7. Lege ein kleines, überprüfbares Ziel an und erteile eine begrenzte Testaufgabe.
8. Kontrolliere Ergebnis und Laufprotokoll, bevor du mehr Rechte vergibst.

Eine Rolle beschreibt Zuständigkeit; eine Werkzeugfreigabe eröffnet konkrete
Fähigkeiten. Ein hoher Autonomie-Level ersetzt weder eine fehlende Verbindung
noch fehlende Werkzeugrechte. Die neuen Agenten aus der KI-Einrichtung besitzen
absichtlich zunächst keine Werkzeuge.

Die Oberfläche bietet Autonomie-Level 0–5. Für die tatsächliche Ausführung zählen
zusätzlich die serverseitigen Regeln:

| Werkzeugaktion | Aktuelle Freigaberegel |
| --- | --- |
| Kalender lesen | Möglich, wenn das Werkzeug angeboten wird |
| Kalender anlegen oder ändern | Bei Level 0–3 konkrete Freigabe, bei 4–5 im erlaubten Bereich direkt |
| Kalender löschen | Immer konkrete Freigabe |
| Code-Add-on oder ausgehendes MCP-Werkzeug | Immer konkrete Freigabe |
| Mail oder Messenger entwerfen | Ein Entwurf ist noch kein Versand; Versandbestätigung gesondert beachten |

Die Level sind kein universeller „Auto-Modus“, der beliebige Arbeiten dauerhaft
im Hintergrund erledigt. Details und Betriebsgrenzen stehen in [RUNTIME.md](RUNTIME.md).

## 10. Freigaben richtig bearbeiten

### 10.1 Einrichtungsplan oder Werkzeugaufruf?

Es gibt unterschiedliche Entscheidungen:

- **Einrichtungsplan:** Unter `/einrichten`; ändert bei Übernahme das erlaubte Firmenprofil.
- **Werkzeug-Freigabe:** Unter `/entscheidungen`, Abschnitt **Agentenläufe &
  Werkzeug-Freigaben**; führt den angezeigten konkreten Werkzeugaufruf aus.
- **Fachliche Aufgabenentscheidung:** Ebenfalls unter Entscheidungen; ein
  Aufgabenstatus ist nicht automatisch der Beleg für einen ausgeführten API-Aufruf.
- **Nachrichtenversand und Add-on-Installation:** Besitzen zusätzliche eigene
  Bestätigungsabläufe. Nicht mit einer reinen Planfreigabe verwechseln.

### 10.2 Einen Werkzeugaufruf prüfen

1. Öffne **Leitung → Entscheidungen**.
2. Wähle den passenden Lauf aus.
3. Lies Werkzeugname, Begründung und die konkreten Eingaben.
4. Prüfe Ziel, Empfänger, Datum, Inhalt und Umfang der Änderung.
5. Wenn alles stimmt, klicke **Freigeben & ausführen**.
6. Andernfalls klicke **Ablehnen** oder brich einen noch abbrechbaren Lauf ab.
7. Öffne **Ergebnis** und bei Bedarf **Prüfprotokoll**.

Eine Freigabe gilt für genau die gespeicherten Eingaben und die zugehörige
Werkzeugdefinition. Sie ist keine pauschale Erlaubnis für ähnliche spätere Aktionen.

### 10.3 Statusmeldungen richtig lesen

| Status | Bedeutung |
| --- | --- |
| Eingereiht | Lauf wurde angelegt |
| Läuft | Verarbeitung läuft |
| Wartet auf Freigabe | Ein konkreter Aufruf benötigt deine Entscheidung |
| Abgeschlossen | Der Lauf ist beendet; einzelne Aktionen können trotzdem abgelehnt worden sein |
| Fehlgeschlagen | Fehler oder unterbrochene Ausführung; Ergebnis prüfen |
| Abgebrochen | Lauf wurde beendet; vorherige Wirkungen werden nicht rückgängig gemacht |

Nach Freigabe wird die Aktion ausgeführt und ihr Ergebnis gespeichert. Die KI
setzt das vollständige Gespräch danach **noch nicht automatisch** fort. Wenn du
eine weitere Auswertung möchtest, stelle eine neue Nachricht mit Bezug auf das Ergebnis.

Nach einem Absturz oder Timeout können externe Änderungen bereits erfolgt sein.
Vor einer Wiederholung deshalb Kalender, Postfach oder anderes Zielsystem prüfen.
Nicht davon ausgehen, dass „Fehlgeschlagen“ automatisch „nichts passiert“ bedeutet.

## 11. Weitere Arbeitsbereiche nutzen

### Kalender

Unter **Arbeitsplatz → Kalender** Datum und Ansicht wählen, einen fiktiven
Testtermin anlegen und die Anzeige kontrollieren. Bei Nutzung über die KI die
Freigaberegeln aus Abschnitt 9 beachten. Der vorhandene lokale Kalender ist
nicht automatisch eine vollständige Synchronisierung eines externen Kalenders.

### Mail und andere Konten

Unter **Verbindungen** das gewünschte Konto öffnen, nur erforderliche Felder
ausfüllen und mit möglichst wenigen Rechten testen. Für das erste E-Mail-Setup
zunächst Lesen und Entwürfe bevorzugen. Ein erfolgreicher IMAP-Test beweist noch
keinen funktionierenden SMTP-Versand. Ausgehende Bestätigung zunächst eingeschaltet lassen.

### Dokumente und Recherche

Bei Dokumenten zuerst eine harmlose Testdatei hochladen und ihren Download prüfen.
Ein Upload bedeutet nicht automatisch, dass sämtliche Inhalte indexiert oder
bei jedem Modellaufruf berücksichtigt werden. Recherchequellen prüfen;
Suchfunktion und externe Seiten benötigen passende Netzwerkfreigaben.

### Studio und Bildanalyse

Ein kleines, nicht vertrauliches Testbild verwenden. Studio benötigt einen
separaten erreichbaren, OpenAI-kompatiblen Vision-Endpunkt. Der Betreiber
konfiguriert dessen Basisadresse über `VISION_URL`; die Chat-Verbindung allein
setzt sie nicht. Auch hier darf die Basisadresse nicht versehentlich doppelt
`/v1` enthalten. Bei isolierten Containern muss der Vision-Dienst ausdrücklich
über eine erlaubte Verbindung erreichbar sein.

### CRM, Marketing und Kennzahlen

Zum Kennenlernen nur fiktive Kontakte, Beispieldaten und Entwürfe anlegen.
Unter **CRM** Kundenarbeit strukturieren, unter **Marketing** Inhalte planen und
unter **Kennzahlen** messbare Werte pflegen. Ein erzeugter Kampagnentext ist
noch keine veröffentlichte Anzeige und ein manuell erfasster Messwert keine
automatisch angebundene Datenquelle.

### Tresor

Zum Einstieg einen unwichtigen Testtext verschlüsseln und die Entschlüsselung
prüfen. Eigene Schlüssel und nötige Entschlüsselungsinformationen getrennt und
sicher verwahren. Der Tresor ersetzt weder eine Server-Datensicherung noch
automatisch den Schutz aller anderen Astoris-Bereiche.

### Anrufe

Der Bereich **Anrufe** ist optional und benötigt eine gesondert eingerichtete
Telefonie-Anbindung. Eine funktionierende Chat-KI nimmt nicht automatisch
Telefonanrufe entgegen. Vor echten Anrufen Rufnummer, Webhook-Sicherheit,
Benachrichtigung, Kosten und den vorgesehenen Umgang mit Gesprächsdaten prüfen.
Einrichtung und Voraussetzungen: [Call-AI](CALL-AI.md).

### Erweiterungen

Nur benötigte und geprüfte Erweiterungen installieren. Berechtigungen, Code,
Zieladressen und Kosten vor Freigabe prüfen. Code-Add-ons laufen eingeschränkt,
aber die aktuelle Sandbox ist keine vollständige Sicherheitsgrenze gegen
absichtlich bösartigen Code. Keine unbekannten Add-ons auf einer Instanz mit
echten Konten und Geheimnissen ausprobieren.

## 12. Externe Agenten und MCP

### 12.1 Ein externer Agent greift auf Astoris zu

Öffne unter **Einrichtung** zunächst **Optional: externe KI-Agenten anbinden**.
Dieser Bereich ist für den normalen Einstieg nicht erforderlich. Im darin
enthaltenen Abschnitt **Codex / Claude Code anbinden**:

1. Die richtige Firma auswählen.
2. Einen beschreibenden, nicht personenbezogenen Zugangsnamen vergeben.
3. Kurze Gültigkeit wählen: 1, 7 oder 30 Tage.
4. Zunächst nur **Firmenkontext lesen** und bei Bedarf **Einrichtungspläne
   vorschlagen** erlauben.
5. **Zugang erstellen** anklicken.
6. Den einmal sichtbaren Zugang ausschließlich im vorgesehenen Secret-Speicher
   des Clients hinterlegen und anschließend **Geheimnis ausblenden** verwenden.
7. Den angezeigten MCP-Endpunkt über einen kompatiblen Streamable-HTTP-Client anbinden.
8. Mit einem Leseaufruf testen und den Zugang bei Nichtgebrauch widerrufen.

Der Zugangswert wird später nicht erneut angezeigt. Bei Verlust einen neuen
erstellen und den alten widerrufen. Nicht in Screenshots, Tickets, Chatnachrichten,
Versionsverwaltung oder Shell-History kopieren.

Der externe Agent kann nur seine erlaubten Funktionen in der festgelegten Firma
nutzen. Er kann keine eigenen Freigaben erteilen, Verbindungen einrichten, Tokens
verwalten oder andere Firmen auswählen. Die Freigabe eines Vorschlags bleibt
beim angemeldeten Menschen in Astoris.

Weitere Rechte zum Lesen von Läufen oder Starten von KI-Aufgaben nur gezielt
vergeben. Gestartete Aufgaben nutzen Astoris' eingerichteten Modellanbieter und
können Kosten auslösen. Widerruf verhindert neue Zugriffe, macht aber eine
bereits ausgeführte Aktion nicht rückgängig.

Ein erreichbarer Astoris-MCP-Endpunkt ist kein allgemeiner Shell-Zugang und kein
OAuth-Login. Die Client-Konfiguration und vollständigen Scopes sind getrennt in
[AI-SETUP.md](AI-SETUP.md) beschrieben.

### 12.2 Astoris greift auf einen anderen MCP-Server zu

Das ist die umgekehrte Richtung. Unter **Verbindungen → MCP-Server**:

1. Eine vertrauenswürdige Streamable-HTTP-Adresse eintragen.
2. Falls erforderlich den Bearer-Token im geheimen Feld hinterlegen.
3. Exakte erlaubte Werkzeugnamen kommagetrennt angeben.
4. **Ausgewählte MCP-Werkzeuge anbieten** aktivieren und speichern.
5. Einen begrenzten Testauftrag stellen und den konkreten Aufruf prüfen.

Jeder angebotene MCP-Werkzeugaufruf benötigt eine Freigabe. Diese Verbindung
macht Astoris nicht automatisch auf beliebige externe Server zugriffsberechtigt.

### 12.3 Netzwerkschutz und zusätzliche Anmeldungen

Ein externer Client muss die Astoris-Adresse aus seiner eigenen Laufzeit erreichen
können. Eine nur private Instanz benötigt auch auf dem Client den passenden
Netzwerkzugang. Eine zusätzliche vorgeschaltete HTTP-Anmeldung kann mit der
Bearer-Authentifizierung des MCP-Endpunkts kollidieren. Das muss der Betreiber
gezielt lösen; nicht die gesamte Instanz oder Token-Prüfung ungeschützt freigeben.

## 13. Sicherheit und Datenschutz

### Vor der ersten echten Nutzung

- HTTPS beziehungsweise einen bewusst abgesicherten lokalen Kanal verwenden.
- Zugang im Passwortmanager speichern; keine allgemeinen Standardpasswörter verwenden.
- Modellanbieter, Datenweitergabe und mögliche Kosten bewusst auswählen.
- Nur erforderliche Verbindungen und Rechte freischalten.
- In **Einstellungen** die Bestätigung für ausgehende Nachrichten aktiviert lassen.
- Den Cloud-Schutz **aigate** bewusst konfigurieren; er ersetzt keine Inhaltsprüfung.
- Fiktive Daten für Tests, Screenshots und Support-Anfragen verwenden.
- Daten und Schlüssel sichern, bevor echte Konten angeschlossen werden.

### Was nicht veröffentlicht werden darf

Die echte `.env`, das gesamte `data/`, TLS-Privatschlüssel, Master-Key,
Zugangsdateien, Backups, Sitzungscookies und Agenten-Tokens sind privat.
Das gilt auch dann, wenn Teile verschlüsselt sind. Interne Hostnamen,
Netzwerkadressen und echte Firmendaten nicht ungeprüft in öffentliche Tickets übernehmen.

Ein öffentlicher Repository-Link ist unproblematisch, aber private
Bereitstellungsnotizen und lokale Zugangsdateien gehören nicht in die Anleitung.

### Welche Daten sind verschlüsselt?

Verbindungen und viele Datenbank-Payloads werden mit dem Server-Master-Key
verschlüsselt. Metadaten wie IDs, Status und Firmenzuordnung sind teilweise
unverschlüsselt. Altdaten, Uploads, Einstellungen und weitere Dateien können
ebenfalls Klartext enthalten. Nicht behaupten, das gesamte Datenverzeichnis sei
vollständig verschlüsselt oder für eine Veröffentlichung geeignet.

Der automatisch erzeugte Server-Schlüssel liegt unter `data/.master.key`, sofern
kein externer `ASTORIS_MASTER_KEY` verwendet wird. Ohne den passenden Schlüssel
sind gesicherte verschlüsselte Inhalte nicht nutzbar. Den Schlüssel weder
anzeigen noch in eine öffentliche Anleitung kopieren.

Die optionale Klartext-Spiegelung von Verbindungen in `.env` mit
`ASTORIS_MIRROR_ENV=true` sollte nicht unbeabsichtigt aktiviert werden; sie ist
standardmäßig aus. Auch ohne Spiegelung bleibt `.env` eine private Datei.

### Grenzen der Selbsthosting-Installation

Astoris ist derzeit kein gehärtetes öffentliches Mehrnutzer-SaaS. Mehrere Firmen
ersetzen keine vollständige Mandanten- und Benutzerrechteverwaltung. Für ein
Datenverzeichnis genau **einen** Astoris-Anwendungsprozess betreiben; keine
mehreren Replikate mit gemeinsamem Datenverzeichnis starten.

In einem bewusst abgeschotteten Testcontainer können Cloud-KI, Internet-Recherche,
Mail und andere externe Konten durch Netzwerkregeln gesperrt sein. Das ist nicht
automatisch ein App-Fehler. Benötigte Ziele gezielt mit dem Betreiber freigeben,
nicht pauschal Internetzugriff, Docker-Socket oder Host-Dateisystem einhängen.

## 14. Sichern, aktualisieren und wiederherstellen

Dieser Abschnitt ist für Betreiber. Anwender müssen dafür weder Schlüssel
auslesen noch Containerbefehle ausführen.

### 14.1 Was gehört in eine vollständige Sicherung?

1. Das komplette persistente `data/` einschließlich Master-Key, sofern dort abgelegt.
2. Einen extern bereitgestellten Master-Key über den zuständigen Secret-Speicher.
3. Private Laufzeitkonfiguration und die benötigten Zertifikate beziehungsweise
   das dokumentierte Verfahren für deren erneute Bereitstellung.
4. Verwendeten Quellcode-Stand beziehungsweise das genaue Containerimage und
   die zugehörige Compose-/Proxy-Konfiguration.

Backups enthalten sensible Daten. Sie gehören in geschützten, möglichst
verschlüsselten Speicher außerhalb des öffentlichen Repositorys. Eine zweite
Kopie auf demselben Datenträger schützt nicht vor dessen Ausfall.

### 14.2 Sicheres Standardverfahren mit Wartungsfenster

1. Keine neuen Aufträge annehmen und aktive Aktionen prüfen.
2. Die Astoris-Anwendung geordnet stoppen.
3. Prüfen, dass sie wirklich nicht mehr schreibt.
4. Das komplette Datenverzeichnis sowie Konfiguration und Schlüssel sichern.
5. Vollständigkeit und geschützte Zugriffsrechte prüfen.
6. Anwendung starten und einen Funktionstest durchführen.

Beispiel für die unveränderte Standard-Compose-Installation, in Bash aus dem
Projektverzeichnis. Bei einem Fehler nicht einfach mit dem nächsten Schritt
fortfahren; die Anwendung bleibt bis zum bewussten Start angehalten.

```bash
umask 077
mkdir -p ../astoris-backups
astoris_backup_dir=$(mktemp -d ../astoris-backups/sicherung.XXXXXX)
docker compose stop astoris
docker compose ps -a astoris
```

Erst nachdem der Dienst als beendet angezeigt wird:

```bash
docker compose cp astoris:/app/data "$astoris_backup_dir/data"
cp .env docker-compose.yml Caddyfile "$astoris_backup_dir/"
git bundle create "$astoris_backup_dir/source.bundle" --all
git rev-parse HEAD > "$astoris_backup_dir/source-commit.txt"
```

Die Befehle setzen eine Installation aus Git mit diesen Dateinamen voraus.
Zusätzliche Compose-Dateien, lokale Codeänderungen, extern verwaltete Secrets
und abweichende Zertifikatsablagen separat sichern. `git bundle` umfasst weder
uncommittete Änderungen noch private Laufzeitdateien.

Nach erfolgreicher Kontrolle des Backups:

```bash
docker compose start astoris
docker compose ps
```

Für eine individuelle Bind-Mount- oder Dokploy-Installation die tatsächlich
zugeordnete Datenablage sichern; nicht eine zufällig vorhandene lokale `data/`-Kopie.

Bei laufender SQLite-Datenbank **nicht nur** `runtime.sqlite` kopieren: Der aktive
Zustand kann auch WAL-Dateien benötigen. Für laufende Datenbanksicherungen ist
die SQLite-Backup-API vorgesehen; die übrigen Dateien und Schlüssel müssen
zusätzlich konsistent gesichert werden. Einzelheiten: [RUNTIME.md](RUNTIME.md).

### 14.3 Aktualisieren

1. Release-Hinweise und Änderungen prüfen.
2. Funktionierendes Backup und Rückweg sicherstellen.
3. Den bisherigen Code-/Image-Stand notieren.
4. Bei eigenen Änderungen zunächst `git status` prüfen und Konflikte klären.
5. Für ein Update aus Git nur den vorgesehenen Branch verwenden:

```bash
git status --short
git pull --ff-only
```

6. Bei der Standard-Compose-Installation neu bauen und bereitstellen:

```bash
docker compose up -d --build
docker compose ps
docker compose logs --tail=100 astoris
```

7. Bei Node-Direktbetrieb stattdessen den verwalteten App-Prozess stoppen,
   `pnpm install --frozen-lockfile` und `pnpm run build` ausführen und den Prozess
   mit derselben abgesicherten Konfiguration wieder starten.
8. Anmeldung, Firmenkontext, Modellantwort und Freigaben prüfen.

Die projektinterne Prüfung `pnpm verify` führt Tests, Typprüfung, Build und einen
isolierten Smoke-Test aus. Sie ersetzt nicht den Funktionstest der eigenen
Netzwerk-, Proxy- und Secret-Konfiguration.

Der zusätzliche Browser-Regressionstest ist für Entwicklungs- und CI-Umgebungen
vorgesehen. Er verwendet ausschließlich temporäre Daten und einen lokalen
Modell-Testserver. Nach Installation der Entwicklungsabhängigkeiten:

```bash
pnpm exec playwright install chromium
pnpm build
pnpm test:browser
```

Er prüft den echten Browserweg vom ersten Login durch die Firmen-Tour bis zur
Modellverbindung und bewussten Planübernahme. In CI wird er ebenfalls ausgeführt.
Keinen Browser-Test gegen das eigene produktive Datenverzeichnis umkonfigurieren.

### 14.4 Wiederherstellen

Nicht zuerst das vorhandene Volume löschen oder das Backup über eine laufende
Datenbank kopieren. Ein fehlgeschlagener Zustand kann für Diagnose und Rückweg
noch wichtig sein.

1. Astoris stoppen und den aktuellen Zustand separat sichern.
2. Eine **neue, leere** Datenablage als Wiederherstellungsziel bereitstellen.
3. Den vollständigen gesicherten Datenbestand einschließlich passendem Schlüssel
   dorthin zurückspielen und die notwendigen Dateirechte des App-Benutzers herstellen.
4. Die Konfiguration auf genau diese Datenablage und die passende Code-/Image-Version setzen.
5. Sicherstellen, dass nur ein App-Prozess darauf zugreift.
6. Zunächst abgeschottet starten und Anmeldung, Daten sowie Modellverbindung testen.
7. Erst dann den normalen Zugang umschalten und den alten Bestand weiter aufbewahren.

Die konkreten Restore-Befehle hängen vom verwendeten Volume, Container-Benutzer
und Deployment ab. Sie dürfen nicht aus einem fremden System blind übernommen
werden. Nur alten Code zu starten ist kein vollständiger Daten-Rollback:
Bereits migrierte SQLite-Daten werden nicht automatisch zurück in alte JSON-Dateien geschrieben.

## 15. Probleme systematisch beheben

| Beobachtung | Zuerst prüfen | Sichere nächste Maßnahme |
| --- | --- | --- |
| Seite nicht erreichbar | Richtige Adresse, Port, privates Netzwerk, App- und Proxy-Status | Verbindung und Dienststatus prüfen; nicht blind Ports öffentlich öffnen |
| HTTPS-/Zertifikatsfehler | Adresse und Zertifikat passen zusammen? | Betreiber um Korrektur bitten; Zertifikatsprüfung nicht pauschal deaktivieren |
| `502` oder `503` am Browserzugang | Proxy erreicht App? Container gesund? | App-/Proxy-Logs prüfen; vom Modellfehler unterscheiden |
| Noch keine Anmeldung eingerichtet | Neuer oder versehentlich leerer Datenbereich? | Bei vorhandener Installation zuerst Volume-Zuordnung prüfen, nicht neu initialisieren |
| Erstzugang wird mit `403` abgelehnt | Lokaler Kanal beziehungsweise erkannte Identität fehlt? | Betreiberverfahren aus Abschnitt 3 prüfen; Auth-Dateien nicht löschen |
| Passwort falsch oder vergessen | Richtiger Benutzer und richtige Instanz? | Passwortmanager beziehungsweise Betreiber nutzen; keine wiederholten Rateversuche |
| `401` bei geschützter API | Sitzung oder Agentenzugang gültig? | Neu anmelden; Agenten-Token gilt nur für seinen MCP-Endpunkt |
| `429` | Anmelde- oder API-Limit erreicht? | Warten und Ursache beheben; nicht mit weiteren Anfragen verschärfen |
| Chat ohne echte Modellantwort | KI-Verbindung eingerichtet und aktiv? | Verbindung testen, Quelle prüfen und einfache Nachricht senden |
| Modell im Container nicht erreichbar | Falsches `localhost`, Basisadresse, Netzwerk oder Port? | Erlaubten Dienstnamen/Gateway und Basis ohne doppeltes `/v1` prüfen |
| KI-Einrichtung liefert keinen gültigen Plan | Modell verfügbar und JSON-Antwort gültig? | Briefing vereinfachen, Meldung beachten, neuen Vorschlag anfordern |
| Planübernahme mit `409` | Firma zwischenzeitlich geändert? | Aktuellen Stand neu laden und neuen Plan erstellen |
| „Plan übernehmen“ deaktiviert | Bestätigungshäkchen gesetzt? Plan gültig? | Plan prüfen, bewusst bestätigen; abgelaufenen Plan neu erstellen |
| Agent verwendet keine Werkzeuge | Werkzeugliste leer, Verbindung oder Scope fehlt? | Gezielt Rechte und Verbindung prüfen; Autonomie nicht pauschal erhöhen |
| Nach Freigabe kommt kein neuer KI-Text | Ergebnis im Lauf vorhanden? | Neue Nachricht stellen; automatische Gesprächsfortsetzung fehlt derzeit |
| Studio meldet Vision-Fehler | Separater `VISION_URL` erreichbar? | Betreiberkonfiguration und Gateway-Route prüfen |
| MCP-Client verbindet nicht | HTTPS, privates Netzwerk, Ablauf, Scope und vorgeschaltete Anmeldung? | Endpunkt und Zugang prüfen; bei Verlust neu ausstellen und alten widerrufen |
| Datenbank-/Dateifehler | Datenträger voll, Rechte, falscher Key, parallele Prozesse? | Weitere Schreibversuche begrenzen, Zustand sichern und Betreiber einschalten |

Für eine Support-Anfrage reichen zunächst App-Version beziehungsweise Commit,
Installationsart, anonymisierte Fehlermeldung und reproduzierbare Schritte mit
Testdaten. Keine vollständigen Konfigurationsdateien, Backups, Cookies oder
ungeprüften Logs veröffentlichen. Auch Logs können personenbezogene Inhalte enthalten.

## 16. Checkliste für den ersten Arbeitstag

- [ ] Die richtige Instanz ist erreichbar; HTTPS und gegebenenfalls privater Zugang funktionieren.
- [ ] Anmeldung funktioniert und der Zugang ist sicher verwahrt.
- [ ] Die richtige Firma ist aktiv; Sprache und Darstellung passen.
- [ ] Ein Modell ist verbunden und hat eine echte Testantwort geliefert.
- [ ] Ein KI-Einrichtungsplan wurde gelesen und bewusst übernommen oder verworfen.
- [ ] Rollen und Ziele sind überschaubar und geprüft.
- [ ] Agenten besitzen nur notwendige Werkzeuge und angemessene Autonomie.
- [ ] Entscheidungen und Prüfprotokoll sind auffindbar.
- [ ] Nachrichtenversand bleibt zunächst bestätigungspflichtig.
- [ ] Testdaten enthalten keine echten Kunden-, Konto- oder Zugangsdaten.
- [ ] Falls genutzt: externe Agentenzugänge sind kurzlebig, zweckgebunden und widerrufbar.
- [ ] Betreiber hat Daten, Schlüssel und Konfiguration gesichert und einen Rückweg vorgesehen.

Wenn diese Punkte erfüllt sind, beginne mit einer kleinen echten Aufgabe und
prüfe das Ergebnis. Weitere Verbindungen und Automatisierung erst schrittweise ergänzen.

## Weiterführende Dokumentation

- [Installation](../INSTALL.md)
- [KI-Einrichtung und externer Agentenzugang](AI-SETUP.md)
- [Agentenlaufzeit, Freigaben und Datensicherung](RUNTIME.md)
- [Selbst-Erweiterung](SELBST-ERWEITERUNG.md)
- [Sicherheitsmeldungen](../SECURITY.md)
- [Docker Compose: Kopieren aus Containern](https://docs.docker.com/reference/cli/docker/compose/cp/)
- [Docker Compose: Verhalten von down und --volumes](https://docs.docker.com/reference/cli/docker/compose/down/)
