# Workflow- und Verständlichkeitstest

Stand: 20. Oktober 2026. Geprüfter App-Code: `010f186`.

## Nachbesserung und erneuter Test

Die nachstehenden ursprünglichen Befunde beziehen sich auf den oben genannten
Ausgangsstand. Im lokalen Arbeitsstand wurden anschließend folgende Korrekturen
implementiert und erneut geprüft. Am 22. Oktober 2026 wurde die korrigierte
Version auf dem getrennten Testsystem bereitgestellt. Davor wurden Daten und
Konfiguration gesichert; das bisherige Containerimage bleibt als Rückfalloption erhalten.

Die Live-Prüfung bestätigte Anmeldung, lokale Modellanbindung, eingeschränkten
MCP-Zugang, Token-Widerruf, Datenbankintegrität und unveränderte Fachdaten.
Zusätzlich wurde die Oberfläche auf dem laufenden Testsystem im Browser in
Hell/Dunkel und Desktop-/Mobilansicht geprüft, ohne dort Formulare abzusenden
oder Screenshots mit echten Firmendaten zu erstellen. Die alte Dokploy-App
bleibt gestoppt. Private Bereitstellungsadressen werden hier nicht dokumentiert.

| Befund | Korrektur | Prüfnachweis |
| --- | --- | --- |
| Anmeldungssackgasse | Login vor der Tour, ausdrückliche clientseitige Weiterleitung nach Erstzugang; Firmen- und Konten-APIs bleiben geschützt | Vollständiger frischer Browserpfad erfolgreich |
| Reverse-Proxy-Erstzugang | Optionales geheimes Setup-Token-Feld; vorhandene serverseitige Token-/Identitätsprüfung bleibt unverändert | Tests für abgelehnten Remote-Zugang, passenden Token und Schutz eines bestehenden Logins |
| Widersprüchlicher Modellhinweis | Gespeicherten Verbindungsstatus anzeigen; ohne getestete Modellverbindung keine interne Planerstellung | Fehlende und gespeicherte Verbindung im Browser geprüft |
| Unklare Ergebnisführung | Rückfragen fokussieren, Plan fokussieren und sichtbar machen, Ergebnis ankündigen | Fokus nach Rückfrage und neuem Plan im Browser geprüft |
| Kontrastarme Elemente | Dunkle Schrift auf den betroffenen Primärschaltflächen; passende Linkfarbe für helle Oberflächen | Farbtests für alle sechs Akzente und erneute Hell-/Dunkelprüfung |
| Login ohne feste Feldnamen | Sichtbare verknüpfte Labels und native Formulare mit Enter-Bedienung | Erstzugang und erneuter Login im Browser geprüft |

Zusätzlich wurden technische Agentenoptionen eingeklappt, leere Firmenprofile
verständlich erklärt, ein direkter Link zum Modellbereich ergänzt und nach
Planübernahme nächste Schritte zu Team und Cockpit angeboten. Das Handbuch und
die Installationshinweise sind auf den neuen Ablauf abgestimmt.

Erneute Prüfung:

- `pnpm verify`: 85 Tests erfolgreich, Svelte-Prüfung ohne Fehler oder Warnungen,
  Produktionsbuild und isolierter Produktions-Smoke-Test erfolgreich.
- `pnpm test:browser`: vollständiger Erstzugang, Firmen-Tour, Modellverbindung,
  Rückfragen, bewusste Übernahme, Token-Anzeige/-Widerruf und erneuter Login erfolgreich.
- Browser-Layouts in DE/EN, Hell/Dunkel und 320/390/1440 Pixeln ohne horizontalen
  Überlauf; kleines Login-Fenster auch mit geöffneter Proxy-Einrichtung bedienbar.
- Keine beobachteten JavaScript-Seitenfehler oder unerwarteten HTTP-401-Antworten.

Der dauerhafte Browser-Test liegt unter
[scripts/browser-smoke.mjs](../scripts/browser-smoke.mjs) und ist in die CI-Prüfung
eingebunden. Diese wurde angepasst, aber in diesem lokalen Durchlauf nicht auf
GitHub ausgeführt. Eine unabhängige Erstnutzerstudie und ein umfassender
Barrierefreiheits-Audit stehen weiterhin aus. Empfehlungen zum Erhalt sämtlicher
Tour-Eingaben bei abgelaufener Sitzung sind nicht Teil dieser Korrektur.

## Ursprüngliches Testergebnis

Der Ablauf mit bereits eingerichtetem Zugang funktioniert. Der erstmalige
Firmen-Einstieg ist dagegen noch nicht zuverlässig ohne Hilfe benutzbar:
Anmeldung und Einführung blockieren sich in diesem Pfad gegenseitig.
Zusätzlich erschweren widersprüchliche Modellhinweise, fehlende Fokusführung
und einzelne Farbkontraste die Orientierung.

Dies ist ein technischer Browser-Test mit ergänzender gestalterischer Bewertung,
keine Studie mit unabhängigen Erstnutzern und keine vollständige
Barrierefreiheits-Zertifizierung. Empfehlungen sind als solche gekennzeichnet.

## Testumfang und Datenschutz

- Produktionsbuild in einer getrennten temporären Umgebung.
- Ausschließlich fiktive Firmenangaben und eigens erzeugte Testzugänge.
- Deterministischer lokaler Modell-Testserver; keine Cloud-Aufrufe und keine
  Übermittlung echter Firmeninhalte.
- Frische Installation, Firmen-Tour, Anmeldung, fehlende und vorhandene
  Modellverbindung, Rückfragen, Planprüfung und ausdrückliche Übernahme.
- Separater vorhandener Browserlauf für DE/EN, einmalige Anzeige eines
  Agentenzugangs und dessen Widerruf.
- Layoutprüfung der KI-Einrichtung bei 320, 390 und 1440 CSS-Pixeln in Hell/Dunkel;
  zusätzliche Desktopprüfung von Verbindungen und Entscheidungen sowie
  Desktop-/Mobilprüfung des Logins.
- 14 Screenshots pro erweitertem Browserlauf; nur fiktive Testansichten.
- Redaktioneller Abgleich des Handbuchs mit dem tatsächlich möglichen Einstieg.

Keine Änderung an der laufenden Instanz, echten Zugängen oder Firmendaten.
Die unten genannten Pfade sind allgemeine App-Routen und Repository-Dateien,
keine privaten Serveradressen. Screenshots, interne Domains und Testzugangswerte
werden diesem öffentlichen Bericht nicht beigefügt.

## Bestätigte Befunde

### P1: Firmen-Ersteinrichtung führt in eine Anmeldungssackgasse

P1 bedeutet hier: vor Freigabe des unbeaufsichtigten Erstnutzer-Workflows beheben.

Reproduktion mit einem frischen Datenverzeichnis:

1. `/login` öffnen.
2. Die Anwendung leitet auf `/welcome` weiter.
3. Einführung starten, Funktionsübersicht bestätigen und **Firma** wählen.
4. Einen fiktiven Firmennamen und eine Mission eingeben.
5. Den Firmenassistenten bis **Firma einrichten** durchlaufen.
6. **Firma einrichten** anklicken.

Beobachtung: `POST /api/companies` liefert HTTP 401. Die Oberfläche zeigt
**Nicht angemeldet.**, bietet dort aber keinen direkten Weg zur Anmeldung und
anschließenden Fortsetzung. Auch das Laden der Firmenvorlagen scheitert ohne Sitzung.
Ein erneuter Aufruf von `/login` landet vor abgeschlossenem Setup wieder in der Tour.

Ursache: Die Tour verlangt eine geschützte Firmenmutation, bevor sie einen
erreichbaren Browser-Schritt für den Erstzugang bereitstellt. Der serverseitige
Schutz der Firmen-API ist dabei richtig und darf nicht pauschal aufgehoben werden.

Fundstellen: [Zugriffsschutz](../src/hooks.server.ts),
[Einführung](../src/routes/welcome/+page.svelte),
[Firmenassistent](../src/lib/components/CompanyWizard.svelte).

Empfehlung: **Zuerst Zugang einrichten, dann Firma und Konten konfigurieren.**
`/login` muss über den abgesicherten Erstzugangsweg erreichbar sein. Falls eine
Anmeldung erforderlich wird, verständlich dorthin führen und den Tourfortschritt
erhalten. Nicht als Lösung alle Firmen-APIs anonym freigeben.

Das [Handbuch](HANDBUCH.md), Abschnitt 3.2, muss an den korrigierten Ablauf
angepasst werden: Sein direkter Browser-Aufruf von `/login` ist im frischen
Ist-Zustand noch nicht wie beschrieben möglich. Der dokumentierte lokale
Betreiber-Erstzugang ist ein technischer Umweg, kein einfacher Nutzerworkflow.

### P2: Modellstatus und Handlungsaufforderung widersprechen sich

Nach erfolgreichem Speichern und Testen einer Modellverbindung zeigt
`/einrichten` weiterhin **Zuerst unter Verbindungen ein KI-Modell hinterlegen.**
Der Hinweis wird unabhängig vom echten Modellstatus eingeblendet.
Ohne Modell wird die Plan-Schaltfläche nach Eingabe eines Briefings ebenfalls
aktiv; ihr Zustand erklärt die fehlende Voraussetzung also nicht.

Auswirkung: Ein Nutzer kann ein bereits korrekt verbundenes Modell erneut
einrichten oder trotz fehlender Voraussetzung mit einer erfolglosen Anfrage starten.

Fundstellen: [Einrichtungsseite](../src/routes/einrichten/+page.svelte),
[Einrichtungstexte](../src/lib/i18n/ai-setup.ts).

Empfehlung: Sichtbaren Status **Modell verbunden** beziehungsweise **Modell fehlt**
anzeigen. Nur bei fehlendem Modell die passende Einrichtungsaktion anbieten.
Technische Details hinter einem optionalen Bereich lassen.

### P2: Ein neuer Plan erhält keine klare Fokus- und Ergebnisführung

Nach einer Rückfrage und nach Erstellung eines Plans lag der aktive Browserfokus
auf `BODY`, nicht auf dem neuen Eingabe- oder Ergebnisbereich. Die Schaltfläche
zur Übernahme lag im Desktop-Test bei ungefähr 1352 Pixeln von oben, außerhalb
des 1000 Pixel hohen Sichtbereichs. Der Plananfang war teilweise sichtbar;
die vollständige Prüfung und Übernahme erfordern Scrollen.

Scrollen allein ist kein Fehler. Problematisch ist die Kombination aus neuem
Inhalt, fehlender gezielter Fokusführung und keiner klaren nächsten Aktion am
Ausgangspunkt. Eine vorhandene Live-Region an anderer Stelle der Anwendung
beweist keine gezielte Ankündigung des neuen Plans.

Empfehlung: Rückfragen fokussieren; nach Erstellung den Plan mit einer eindeutigen
Meldung ankündigen und zum Plananfang führen. Einen sichtbaren Übergang
**Plan ist bereit – jetzt prüfen** anbieten. Freigabe weiterhin erst nach
inhaltlicher Prüfung und bewusstem Häkchen erlauben.

### P2: Einzelne wichtige Farbkombinationen sind kontrastarm

Aus berechneten Browserfarben ermittelte Kontrastverhältnisse:

| Element | Darstellung | Verhältnis |
| --- | --- | --- |
| Link **Klassische Einrichtung öffnen** | Orange auf hellem Hintergrund | ca. 1,93:1 |
| Grundfarben der Primärschaltfläche auf der KI-Einrichtungsseite | Helle Schrift auf Orange im Hellmodus | ca. 1,93:1 |
| **Firma einrichten** in der klassischen Tour | Weiß auf Orange | ca. 2,69:1 |
| Vergleich: **Anmelden** | Dunkle Schrift auf Orange | ca. 6,88:1 |

Die Werte beschreiben die geprüften Grundfarben, keine vollständige Bewertung
aller Zustände oder Hintergrundeffekte. Eine deaktivierte Schaltfläche besitzt
zusätzlich eine reduzierte Deckkraft. Der aktive Einrichtungslink zeigt das
Kontrastproblem unabhängig von deaktivierten Zuständen.

Empfehlung: Für den Hellmodus eine dunklere Linkfarbe vorsehen. Orange
Primärschaltflächen mit einer konsistent dunklen Textfarbe gestalten, wie bereits
beim Login und unter Verbindungen. Alle angebotenen Akzentfarben danach erneut prüfen.

### P2: Login-Felder haben keine dauerhaften Beschriftungen

Die Felder für Benutzername und Passwort werden nur durch Platzhalter erklärt.
Es gibt an diesen Inputs keine zugeordneten `label`-Elemente oder ausdrücklich
gesetzten ARIA-Beschriftungen. Beim Tippen verschwinden die sichtbaren Feldnamen.

Das kann die Orientierung erschweren und ist bei Vergrößerung oder assistiver
Bedienung unnötig fehleranfällig. Eine vollständige Screenreader-Prüfung wurde
nicht durchgeführt; aus diesem Befund allein folgt keine allgemeine Aussage
über alle Browser-Accessibility-Namen.

Fundstelle: [Login](../src/routes/login/+page.svelte).

Empfehlung: Feste sichtbare Labels mit den Eingabefeldern verknüpfen.
Platzhalter höchstens für zusätzliche Beispiele verwenden.

## Gestalterische Empfehlungen, keine Funktionsfehler

1. **Ein Einstieg statt konkurrierender Wege:** Klassische Tour und KI-Einrichtung
   mit einem klaren gemeinsamen Einstieg und erkennbarer Reihenfolge verbinden.
2. **Nächsten Schritt zeigen:** Eine kurze Fortschrittsanzeige wie
   **Zugang → Modell → Firma beschreiben → Plan prüfen → Starten** anbieten.
   Die aktuell verschachtelten Fortschrittsbalken erklären die Gesamtreihenfolge nicht.
3. **Fortgeschrittenes einklappen:** Externe Agentenzugänge, MCP-Konfiguration und
   technische Berechtigungen auf der Einrichtungsseite zunächst als optional
   kennzeichnen und einklappen. Nicht für den ersten erfolgreichen Plan voraussetzen.
4. **Modell zuerst auffindbar machen:** Der Weg **KI & Konten verbinden** öffnet
   einen umfangreichen Katalog, dessen erste sichtbare Bereiche nicht die
   KI-Modellverbindung sind. Direkt zur Modellkonfiguration führen oder sie priorisieren.
5. **Leere Zustände erklären:** Bei einer noch leeren Firma nicht nur eine leere
   Profilkarte mit Trennpunkt anzeigen, sondern **Noch keine Firma eingerichtet**
   und den nächsten sinnvollen Schritt.
6. **Handbuch in zwei Lesetiefen nutzen:** Den vorhandenen Schnellstart beibehalten;
   Betreiberbefehle als Vertiefung behandeln. Die rund 5400 Wörter und 16 Kapitel
   sind Nachschlagewerk, nicht Voraussetzung für die erste Modellantwort.

## Was im Test funktioniert hat

- Sämtliche 75 vorhandenen automatisierten Funktionstests erfolgreich.
- Bestehender Browser-End-to-End-Test: Rückfragen, Planvorschau, bewusste Freigabe,
  DE/EN, Desktop/Mobil, einmalige Tokenanzeige und Widerruf erfolgreich.
- Kein beobachteter JavaScript-Seitenfehler in den beiden Browserprüfungen.
- In den geprüften Layouts kein horizontaler Überlauf.
- Ohne Bestätigungshäkchen ist **Plan übernehmen** deaktiviert.
- Die Firmendaten blieben bis zur ausdrücklichen Übernahme unverändert.
- Die Übernahme änderte anschließend genau das geprüfte fiktive Firmenprofil.
- Die KI-Einrichtungsformulare besitzen zugeordnete Feldbeschriftungen.
- Ruhige Kartenaufteilung, gut erkennbare Überschriften und insgesamt gut
  lesbare Fließtexte; die genannten Kontrastprobleme betreffen einzelne Elemente.

Grüne Funktionstests ersetzen den Erstnutzer-Test nicht: Der beobachtete frische
Firmen-Tourpfad wird durch die bisherigen Erfolgsprüfungen nicht ausreichend abgesichert.

## Empfohlene Umsetzungsreihenfolge

1. Erstzugang und Tour-Reihenfolge korrigieren, ohne Zugriffsschutz zu lockern.
2. Genau diesen frischen Firmenpfad als dauerhaften Browser-Regressionstest ergänzen.
3. Handbuch und App auf dieselbe tatsächliche Reihenfolge bringen.
4. Modellstatus und Ergebnisführung korrigieren.
5. Kontraste und Login-Beschriftungen vereinheitlichen.
6. Technische Zusatzoptionen vereinfachen und mit wenigen unabhängigen
   Erstnutzern prüfen, ob sie ohne Hilfe bis zur ersten erfolgreichen Aufgabe kommen.

Der ursprüngliche Prüfauftrag änderte keine App-Funktionen. Die anschließend
beauftragten Korrekturen und deren Prüfnachweise stehen oben im Abschnitt
**Nachbesserung und erneuter Test**; die ursprünglichen Befunde bleiben zur
Nachvollziehbarkeit erhalten.
