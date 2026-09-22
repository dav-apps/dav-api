# Tests

Das Testgrundgerüst verwendet Vitest, Supertest, Nock und V8-Coverage.
Es wurde mit Node.js 24 geprüft. TypeScript 5.3, Prisma 5, Apollo 4 und
Express 4 bleiben erhalten. Die Node-Typdefinitionen sind für die
Kompatibilität mit TypeScript 5.3 explizit festgeschrieben.

## Lokal ausführen

```sh
npm ci
npm run build
npm run typecheck
npm test
```

Der Build generiert zuerst den Prisma-Client; dafür ist keine Datenbankverbindung nötig.
Die schnellen Tests (`npm test`)
benötigen weder PostgreSQL noch Redis noch echte Zugangsdaten und laden keine
`.env`. HTTP-Tests öffnen kurzlebige lokale Ports; eine Sandbox muss dies erlauben.
Nock sperrt ausgehende externe HTTP-Anfragen. PostgreSQL-/Redis-Clients werden
in dieser ersten Stufe ausschließlich durch Test-Doubles ersetzt.

```sh
npm run test:watch
npm run test:coverage
```

Der Coverage-Bericht liegt unter `coverage/index.html`. Es gibt vorerst keine
Mindestquote: Die schnelle Suite sichert die Anwendungsstruktur und ausgewählte Regeln ab, noch nicht
sämtliche Geschäftsregeln. `npm run dev` startet weiterhin nur Build- und
Server-Watch, nicht automatisch den neuen Test-Watch.

## Struktur und Lebenszyklus

- `src/schema.ts`: `createSchema()` erstellt das tatsächliche Anwendungsschema.
- `src/app.ts`: `createApp(dependencies)` liefert `app`, `server` und `httpServer`.
  Die Factory startet Apollo, verbindet jedoch keine Clients, öffnet keinen Port
  und registriert keine Cronjobs. Sie übernimmt die bestehende globale
  BigInt-JSON-Serialisierung als String.
- `src/appDependencies.ts`: explizite Abhängigkeiten für Prisma, Redis, Stripe,
  Resend, Dateispeicher und ausgehende Webhook-Requests. Das Stripe-Webhook-Secret
  gehört zur jeweiligen App-Instanz.
- `src/services/fileService.ts`: `createFileService(s3Client, bucket)` kapselt
  Dateizugriffe ohne einen S3-Client beim Import anzulegen.
- `src/tasks.ts`: `createTasks(dependencies)` liefert einzeln aufrufbare Jobs.
  `setupTasks(dependencies)` registriert Cronjobs und liefert eine Stop-Funktion.
- `server.ts`: erstellt und verbindet die produktiven Clients, konfiguriert
  Web Push bei aktiviertem Produktions-Scheduler und öffnet den HTTP-Port.
  SIGTERM/SIGINT stoppen nach erfolgreichem Start zunächst Scheduler und Apollo,
  dann Prisma, Redis und S3. Der Shutdown ist auf zehn Sekunden begrenzt.
  Startfehler nach Client-Erstellung schließen die Ressourcen und liefern Exitcode 1.

Tests müssen `await server.stop()` aufrufen. Selbst erstellte Prisma-, Redis-
und S3-Clients bleiben Eigentum des Aufrufers und müssen von diesem geschlossen
werden. Die Factory schließt übergebene Clients nicht. Für isolierte Tests
immer neue Dependencies erzeugen, keine globalen veränderlichen Client-Singletons.

Die übrige fachliche Umgebungskonfiguration (beispielsweise `DAV_APPS_APP_ID`,
Tarif-IDs und `ENV`) wird weiterhin an den bestehenden Stellen gelesen.
Tests, die sie überschreiben, müssen sie wiederherstellen. Insbesondere gilt
der zeitliche Sessionablauf bisher nur in `ENV=production`; solche Tests
können die App-Factory verwenden, ohne produktive Clients oder Cronjobs zu starten.

## Vorhandene Tests und Erweiterung

- `tests/http/app.test.ts`: Factory ohne Verbindungsaufbau, tatsächliches Schema,
  HTTP-Context, getrennte App-Instanzen, injizierter Dateiservice, Upload-Routing
  und Stripe-Signaturprüfung mit unveränderten Request-Bytes.
- `tests/unit/tasks.test.ts`: explizite Job-Ausführung, keine automatische
  Cron-/VAPID-Konfiguration, registrierte Zeitpläne und deren Stop-Funktion.
- `tests/unit/test-services.test.ts`: Schutzprüfungen für Test-URLs und Trennung
  von den normalen Deployment-URLs.
- `tests/unit/validation.test.ts`: Längen-/Preisgrenzen und Speicherbudgets.
- `tests/adapters/files.test.ts`: echtes S3-SDK gegen kontrollierte HTTP-Antworten,
  Upload-Inhalt und Metadaten, Fehlerantworten und signierte Datei-URLs. Nock
  simuliert dabei auch den `100-continue`-Handshake. Keine echten S3-Zugriffe.
- `tests/helpers/dependencies.ts`: kleine Test-Doubles; unvorbereitete externe
  Operationen schlagen fehl.

GraphQL-Tests mit `executeOperation` umgehen die HTTP-Middleware. Header,
Body-Parser und Routing deshalb über Supertest prüfen. GraphQL-Fehler anhand
von `errors[].extensions.code` prüfen, nicht allein am HTTP-Status.

## Integrationstests mit PostgreSQL und Redis

Voraussetzung: Docker mit Compose. Nach Installation und Prisma-Generierung:

```sh
npm run test:services:up
npm run test:integration
npm run test:services:down
```

`npm run test:all` führt Build, Typecheck, schnelle Tests, Integrations- und Systemtests
aus. Die Testdienste müssen dafür bereits laufen. Sie werden bewusst nicht
automatisch durch `npm test` gestartet.

Compose verwendet das Projekt `dav-api-tests` und folgende ausschließlich lokale
Dienste, getrennt von Pocketlib und den Entwicklungsdiensten:

| Dienst        | Adresse           | Testidentität                               |
| ------------- | ----------------- | ------------------------------------------- |
| PostgreSQL 16 | `127.0.0.1:55434` | Datenbank, Benutzer und Passwort `dav_test` |
| Redis 7       | `127.0.0.1:56381` | Datenbank 14, Passwort `dav_test`           |

PostgreSQL speichert im Container-tmpfs; Redis-Persistenz ist deaktiviert.
Es werden keine persistenten Datenvolumes angelegt. Beim Herunterfahren gehen
die Testdaten verloren. Die PostgreSQL-Hauptversion muss bei der späteren
Deployment-Abstimmung mit der tatsächlich eingesetzten Version verglichen werden.

`test:db:prepare` erstellt das Schema mit `prisma db push --skip-generate`,
solange keine eingecheckten Prisma-Migrationen vorhanden sind. Es verwendet nur
die vorher validierte Test-URL. Die normale `DATABASE_URL` wird überschrieben,
auch wenn Prisma eine lokale `.env` einliest. Es werden keine automatischen
Reset-/Datenverlust-Flags an Prisma übergeben.

Andere lokale Ports lassen sich explizit angeben:

```sh
TEST_DATABASE_URL=postgresql://dav_test:dav_test@127.0.0.1:55435/dav_test TEST_REDIS_URL=redis://:dav_test@127.0.0.1:56382/14 npm run test:integration
```

Erlaubt sind nur Loopback-Hosts mit genau diesen Datenbanknamen, Zugangsdaten
und der Redis-Datenbank 14, ohne URL-Parameter oder Fragmente. `DATABASE_URL`
und `REDIS_URL` werden von den Testclients ignoriert. Beide Test-URLs werden
vor dem Schemaaufbau und erneut vor dem Verbindungsaufbau geprüft.

Diese Dienste müssen ausschließlich für Tests reserviert sein. Vor und nach
jedem Integrationstest werden Benutzer, Entwickler, Apps, Tabellen,
Redis-Wiederholungsoperationen, Benutzer-Snapshots sowie Webhook-Ereignisse und
Webhook-Nebenwirkungen inklusive abhängiger
Datensätze zurückgesetzt (`TRUNCATE ... RESTART IDENTITY CASCADE`). Vor diesem
Reset werden zusätzlich der tatsächliche PostgreSQL-Datenbankname und Benutzer
geprüft. Redis-Datenbank 14 wird vollständig geleert. Keine Entwicklungsdaten
in diesen Instanzen ablegen.

Dateien laufen sequenziell. Nicht mehrere Testläufe gleichzeitig gegen dieselben
Dienste starten. Die Fixture-Factories liefern frische Benutzer, Entwickler,
Apps, Tabellen, Sessions und Objekte; der Reset stellt die für den bestehenden
Code relevanten IDs 1 (privilegierter Entwickler und Website-App) sicher.

Die Integrationstests verwenden das echte Anwendungsschema, Prisma/PostgreSQL
und Redis. Dateispeicher, E-Mail-Versand, Stripe und ausgehende Webhooks bleiben
kontrolliert ersetzt; für unvorbereitete externe Operationen gibt es keinen
Fallback auf produktive Clients.

- `sessions.test.ts`: echter Passwortvergleich, Login, Website-/App-Sessions,
  Entwickler-Signatur, abgelehnte Logins ohne Änderungen, Tokenrotation und
  Widerruf nach Wiederverwendung, Ablaufgrenze nach 24 Stunden und Logout.
  Die Luxon-Uhr wird für Zeitgrenzen kontrolliert, ohne Datenbank-Timer anzuhalten.
- `permissions.test.ts`: Benutzer-/App-Isolation, verschachtelte Tabellenabfragen,
  vorhandene Lesefreigaben und Aliase, abgelehnte Änderungen ohne Auswirkungen
  auf Datenbank, Cache oder Dateien. Vergabe und Widerruf werden zusätzlich in
  `access-flows.test.ts` geprüft.
- `redis.test.ts`: GraphQL-CRUD mit Property-Typen, BigInt-Serialisierung und
  konsistenten ETags, entfernte/aktualisierte Schlüssel sowie persistierte
  Wiederholungen nach einem ausgefallenen Redis-Client und Wiederverbindung.

Die Regressionstests aus Schritt 2 sichern vier behobene Fehler: Session-Löschung wird
abgewartet; neu berechnete ETags werden auch im zurückgegebenen Objekt aktualisiert;
Redis-Property-Werte werden als Strings übertragen; beim Abgleich werden nur
tatsächlich obsolete Property-Schlüssel gelöscht. Dafür sind keine Schemaänderungen
oder Datenmigrationen erforderlich.

## Fachliche Teststufe (Schritt 3)

Die Integrationstests umfassen zusätzlich:

- `accounts.test.ts`: Registrierung mit echtem Passwort-Hash, doppelte E-Mail,
  Validierung, Entwicklerrechte, Bestätigung mit Einmaltoken, Passwort-Reset,
  bestätigter Passwortwechsel, E-Mail-Wechsel mit Stripe-Abgleich und Rücknahme,
  E-Mail-Providerfehler und erneuter Versand.
- `access-flows.test.ts`: Website-/App-Tokenwechsel, falscher Entwickler/API-Key,
  Anlegen und Widerrufen von Lesefreigaben, App-Prüfung von Alias-Tabellen und
  Aktualisierung des Empfänger-ETags. Der bestehende, von Pocketlib verwendete
  Zugriff über eine bekannte Objekt-UUID bleibt erhalten; dies ist keine neue
  Einladungssystematik. Eine Freigabe erlaubt weiterhin keine Schreibzugriffe.
- `uploads.test.ts`: tatsächliche PNG-Daten, ungültige Bilddaten, abweichender
  MIME-Typ, fehlende Authentifizierung, Benutzer-/App-Isolation, Speichergrenzen,
  parallele Uploads, Ersetzung mit Größen-Differenz, `ignoreFileSize`, Remote-
  Fehler, Datenbank-Rollback nach Remote-Upload, Dateilöschung und Quotenfreigabe.
- `checkout.test.ts`: Centbeträge, Versandkosten und Währung, Stripe-Kunden- und
  Bestellzuordnung, Validierungsfehler ohne Bestellanlage, Stripe-Ausfall,
  Tarifauswahl sowie kostenlose Käufe und deren Sichtbarkeit.
- `webhooks.test.ts`: HTTP mit tatsächlich signierten Stripe-Payloads,
  ungültige Signaturen/Payloads, fehlendes Secret, doppelte und parallele
  Zustellung über getrennte App-/Datenbankclients, App-Neustart, Teilausfälle
  beim Benachrichtigen mehrerer Empfänger, Resend-Fehler, Tarif-/Laufzeitwechsel,
  verspätete Abonnementereignisse und Schutz versendeter Bestellungen vor
  Rückstufung. Ausgehende Providerzugriffe bleiben simuliert.
- `jobs.test.ts`: App-Zuordnung und Fälligkeit von Push-Nachrichten,
  Wiederholungsintervalle, dauerhafte vs. vorübergehende Versandfehler,
  globale und App-Aktivitätsstatistik, UTC-Tagesgrenze, Session-Bereinigung
  nach vier Kalendermonaten sowie partielle Notification-Updates.
- `queries.test.ts`: App-Isolation der Property-Suche, exakte/Teilstring-Filter,
  nicht vorhandene Filterziele, gleichnamige Tabellen verschiedener Apps,
  Bestellstatus und Pagination, Adressberechtigungen, App-Filter und
  Zeitraum-/Rollenprüfung für Statistikabfragen.

`tests/adapters/emails.test.ts` ergänzt die schnelle Suite: Das tatsächliche
Resend-SDK rendert die Bestätigungs-E-Mail, überträgt den Link und behandelt
API-Fehlerantworten bei gesperrtem externem Netzwerk.

Die neuen Regressionstests haben unter anderem fehlende Tokenprüfung beim
Passwort-Reset, offene Requests für ungültige Profilbilder, zu frühe Anlage von
Profilbild-/Dateidatensätzen, fehlende Versandwährung, negative Versandkosten,
App-übergreifende Suchergebnisse, falsche Alias-ETags, unvollständige
Notification-Updates und das Löschen gültiger Push-Abonnements bei temporären
Fehlern aufgedeckt. Diese Fälle sind korrigiert.

Datei-Uploads sperren den Benutzer während Quotenprüfung und Metadatenänderungen
in PostgreSQL. Die lokalen Änderungen werden gemeinsam committed; Redis wird
erst danach aktualisiert. Beim Löschen werden Dateidatensatz und Quotenänderung
ebenfalls gemeinsam committed. Remote-Dateispeicher, PostgreSQL und Redis bilden
keine gemeinsame Transaktion: Ein Datenbankfehler nach erfolgreichem Upload kann
eine bereits hochgeladene Datei zurücklassen. Ein Remote-Löschen kann bei späterem
Datenbank-Rollback ebenfalls nicht rückgängig gemacht werden; der bestehende
S3-Adapter protokolliert Löschfehler weiterhin. Diese Tests behaupten keine
verteilte Atomizität.

Temporäre Push-Fehler behalten Nachricht und Abonnement für den nächsten Lauf.
Nur HTTP 404/410 entfernt das Abonnement. Bei Teilerfolg können bereits erreichte
Geräte beim nächsten Versuch dieselbe Nachricht erneut erhalten. Kontoänderungen
und E-Mail-/Stripe-Aufrufe sind ebenfalls keine gemeinsame Transaktion: Ein
Versandfehler wird jetzt als Fehler gemeldet, bereits gespeicherte ausstehende
Kontoänderungen bleiben aber erhalten und erlauben erneuten Versand.

## Deployment der Webhook-Korrekturen

Vor dem Deployment müssen die additiven Tabellen `webhook_events` und
`webhook_effects` angelegt werden. Ohne Prisma-Migrationshistorie liegt dafür
`prisma/changes/20260918_webhook_delivery.sql` bei. Die Datei muss im bestehenden
Deployment-Prozess gegen die beabsichtigte Datenbank angewendet werden;
anschließend `npx prisma generate` und `npm run build` ausführen. Hier wurde
ausschließlich die isolierte Testdatenbank über `test:db:prepare` aktualisiert.

`STRIPE_WEBHOOKS_SECRET` ist nun erforderlich: Ohne Secret antwortet der Endpoint
mit HTTP 503, bei ungültiger Signatur mit HTTP 400. Die Prüfung verwendet die
unveränderten Request-Bytes. Stripe beschreibt Wiederholungen und fehlende
Reihenfolgegarantien in seiner [Webhook-Dokumentation](https://docs.stripe.com/webhooks).

PostgreSQL-Advisory-Locks serialisieren die Verarbeitung pro Bestellung, Kauf
oder Stripe-Kunde. Erfolgreich verarbeitete Event-IDs werden dauerhaft gespeichert.
Externe Effekte werden einzeln nach Erfolg vermerkt, damit bei Teilausfällen
nur noch fehlende Benachrichtigungen ausgeführt werden. Fehler liefern HTTP 502
und lassen fehlende Benachrichtigungen wiederholbar. Fachliche Änderungen werden
vor den externen Aufrufen in einer eigenen Transaktion committed, damit Empfänger
die aktuellen Bestelldaten sofort lesen können. Nur Fehler innerhalb dieser
fachlichen Transaktion rollen deren Änderungen zurück; ein späterer Versandfehler
nicht. Der Verbindungspool benötigt dafür mindestens zwei freie Verbindungen pro
aktivem Handler (zusätzliche wartende Handler belegen ebenfalls Verbindungen).
Die Verarbeitung hat ein Transaktionslimit von 30 Sekunden; ausgehende App-Webhooks
ein Limit von 10 Sekunden.

Diese Tabellen sind keine Caches und dürfen im Betrieb nicht routinemäßig geleert
werden. Historische Ereignisse werden nicht automatisch nachgeliefert. Werden
bereits vor diesem Deployment abgeschlossene Käufe erneut zugestellt, können
Benachrichtigungen mangels damaliger Erfolgsvermerke erneut versendet werden.

Verspätete Abonnementereignisse mit kleinerem `event.created` als ein bereits
verarbeitetes Ereignis desselben Kunden ändern den Tarif nicht erneut. Bei gleichen
Sekundenwerten kann daraus keine Reihenfolge abgeleitet werden. Bereits versendete
Bestellungen werden durch erneute Checkout-Ereignisse nicht zurückgestuft.

Es gibt keine absolute Exactly-once-Garantie für externe Effekte: Bei einem Absturz
nach erfolgreichem Versand und vor Speicherung der Bestätigung bleibt ein
Unsicherheitsfenster. Das bestehende Resend-4-SDK bietet in dieser Anbindung keinen
Idempotenzschlüssel; ausgehende App-Webhooks benötigen für eine stärkere Garantie
ebenfalls Unterstützung der Empfänger. Bei solchen unklaren Zuständen ist ein
Abgleich mit dem Empfänger nötig. Die neue Verarbeitung deckt bestätigte Erfolge,
reguläre Wiederholungen, Parallelität und die getesteten Teilausfälle ab.

## CI und gebauter Server (Schritt 4)

```sh
npm run test:services:up
npm run test:system
# Alternativ alle Teststufen inklusive Build und Typecheck:
npm run test:all
npm run test:services:down
```

`test:system` baut inklusive Prisma-Generierung, bereitet ausschließlich die
validierte Testdatenbank vor und startet `dist/server.js` als echten Node-Prozess.
Die fünf Systemtests prüfen:

- HTTP/GraphQL-Authentifizierung und eine Mutation mit tatsächlichen PostgreSQL-
  und Redis-Schreibzugriffen, einschließlich Datenbank 14 und Cache-Inhalt;
- Raw-Upload-Routing und echte Stripe-Signaturen ohne Stripe-Netzwerkzugriffe;
- sauberen Prozessabschluss mit Exitcode 0 bei SIGTERM und SIGINT;
- Startabbruch mit Exitcode 1 bei belegtem Port sowie ungültigem `PORT`.

Der Kindprozess erhält nur eine explizite Umgebungs-Allowlist mit Test-URLs und
Dummy-Schlüsseln, keine geerbten Anbieterzugangsdaten oder `NODE_OPTIONS`.
Ein eigener Nock-Preload sperrt externe HTTP-Zugriffe auch im Kindprozess.
`ENV=test` aktiviert keine Cronjobs. Der Server bindet im Test an Loopback und
einen automatisch vergebenen Port (`HOST=127.0.0.1`, `PORT=0`). Zeitlimits,
Prozessdiagnosen und erzwungenes Beenden im Fehlerfall verhindern verwaiste Tests.
Die produktive Cron-Ausführung und bereits laufende Jobs während eines Shutdowns
sind damit nicht Ende-zu-Ende geprüft; Jobfunktionen und Scheduler haben separate Tests.

Eine ausdrücklich in `REDIS_URL` angegebene Datenbank hat beim Serverstart nun
Vorrang. Ohne Datenbankpfad bleiben die bisherigen ENV-Defaults erhalten:
Produktion 1, Test 3, sonst 2. Bestehende Deployment-URLs vor dem Rollout darauf
prüfen, ob ihr Pfad die tatsächlich gewünschte Datenbank angibt.

`.github/workflows/tests.yml` verwendet wie Pocketlib einen Ubuntu-24.04-Runner
mit Node 24, `npm ci`, Build, Typecheck, schneller Suite mit Coverage,
isolierten Compose-Diensten, Integrations- und Systemtests. Der Workflow startet
bei Pull Requests, Pushes nach `dev`, `main`, `master`, `test/**` sowie manuell.
Er benötigt keine Deployment-Secrets und führt kein Deployment durch.
Parallele Läufe desselben Refs werden abgebrochen; Dienste werden über `always()`
aufgeräumt, Coverage wird als Artefakt hochgeladen und bei Fehlern werden
Containerlogs ausgegeben. Grundlage: [GitHub: Node.js bauen und testen](https://docs.github.com/en/actions/tutorials/build-and-test-code/nodejs).

Coverage umfasst weiterhin nur die schnelle Suite, nicht die gesamte
Integrationstestabdeckung; es wird keine irreführende Mindestquote gesetzt.
Ein erfolgreicher lokaler Lauf ersetzt keinen GitHub-Runner-Lauf. Dieser ist nach
Push der Workflow-Datei zu kontrollieren. Falls Branch Protection genutzt wird,
kann der Check `test` anschließend als erforderlich eingerichtet werden.

## Rollout-Checkliste und bewusste Grenzen

1. Zielumgebung, Backup, PostgreSQL-Version und Redis-Datenbankpfad prüfen.
2. Die additive SQL-Datei vor der neuen Anwendung ausführen, im freigegebenen
   Deployment-Kontext zum Beispiel mit:

   ```sh
   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 --single-transaction -f prisma/changes/20260918_webhook_delivery.sql
   ```

   Das ist ein einmaliger Schritt, kein bei jedem Start ausgeführtes Skript.
   Die Testskripte dürfen nicht gegen Deployment-Datenbanken verwendet werden.

3. `STRIPE_WEBHOOKS_SECRET` für genau den jeweiligen Stripe-Endpoint setzen;
   Anbieterzugangsdaten ausschließlich über die bestehende Secret-Verwaltung.
4. Build und Tests prüfen, Anwendung ausrollen, Erreichbarkeit und Webhook-
   Fehler überwachen. Bei App-Rollback die neuen Ledger-Tabellen nicht löschen.

SQL-Rollout, Produktionskonfiguration und Branch-Protection wurden durch die
lokale Implementierung nicht verändert. Live-Anbieter- und Lasttests benötigen
separat vereinbarte Testkonten, Zielsysteme und Last-/Kostenlimits und gehören
nicht zu dieser Suite. Stärkere Zustellgarantien benötigen zusätzlich die oben
beschriebene Idempotenzunterstützung der externen Empfänger.
