# Tests

Das Testgrundgerüst verwendet Vitest, Supertest, Nock und V8-Coverage.
Es wurde mit Node.js 24 geprüft. TypeScript 5.3, Prisma 5, Apollo 4 und
Express 4 bleiben erhalten. Die Node-Typdefinitionen sind für die
Kompatibilität mit TypeScript 5.3 explizit festgeschrieben.

## Lokal ausführen

```sh
npm ci
npx prisma generate
npm run typecheck
npm test
npm run build
```

Die Prisma-Generierung benötigt keine Verbindung zur Datenbank. Die schnellen Tests (`npm test`)
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

-  `src/schema.ts`: `createSchema()` erstellt das tatsächliche Anwendungsschema.
-  `src/app.ts`: `createApp(dependencies)` liefert `app`, `server` und `httpServer`.
   Die Factory startet Apollo, verbindet jedoch keine Clients, öffnet keinen Port
   und registriert keine Cronjobs. Sie übernimmt die bestehende globale
   BigInt-JSON-Serialisierung als String.
-  `src/appDependencies.ts`: explizite Abhängigkeiten für Prisma, Redis, Stripe,
   Resend, Dateispeicher und ausgehende Webhook-Requests. Das Stripe-Webhook-Secret
   gehört zur jeweiligen App-Instanz.
-  `src/services/fileService.ts`: `createFileService(s3Client, bucket)` kapselt
   Dateizugriffe ohne einen S3-Client beim Import anzulegen.
-  `src/tasks.ts`: `createTasks(dependencies)` liefert einzeln aufrufbare Jobs.
   `setupTasks(dependencies)` registriert Cronjobs und liefert eine Stop-Funktion.
-  `server.ts`: erstellt und verbindet die produktiven Clients, konfiguriert
   Web Push bei aktiviertem Produktions-Scheduler und öffnet den HTTP-Port.

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

-  `tests/http/app.test.ts`: Factory ohne Verbindungsaufbau, tatsächliches Schema,
   HTTP-Context, getrennte App-Instanzen, injizierter Dateiservice, Upload-Routing
   und Stripe-Signaturprüfung mit unveränderten Request-Bytes.
-  `tests/unit/tasks.test.ts`: explizite Job-Ausführung, keine automatische
   Cron-/VAPID-Konfiguration, registrierte Zeitpläne und deren Stop-Funktion.
-  `tests/unit/test-services.test.ts`: Schutzprüfungen für Test-URLs und Trennung
   von den normalen Deployment-URLs.
-  `tests/unit/validation.test.ts`: Längen-/Preisgrenzen und Speicherbudgets.
-  `tests/adapters/files.test.ts`: echtes S3-SDK gegen kontrollierte HTTP-Antworten,
   Upload-Inhalt und Metadaten, Fehlerantworten und signierte Datei-URLs. Nock
   simuliert dabei auch den `100-continue`-Handshake. Keine echten S3-Zugriffe.
-  `tests/helpers/dependencies.ts`: kleine Test-Doubles; unvorbereitete externe
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

`npm run test:all` führt Typecheck, schnelle Tests, Integrationstests und Build
aus. Die Testdienste müssen dafür bereits laufen. Sie werden bewusst nicht
automatisch durch `npm test` gestartet. CI und Tests des gebauten Servers als
separater Prozess sind noch nicht eingerichtet.

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
Redis-Wiederholungsoperationen und Benutzer-Snapshots inklusive abhängiger
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

-  `sessions.test.ts`: echter Passwortvergleich, Login, Website-/App-Sessions,
   Entwickler-Signatur, abgelehnte Logins ohne Änderungen, Tokenrotation und
   Widerruf nach Wiederverwendung, Ablaufgrenze nach 24 Stunden und Logout.
   Die Luxon-Uhr wird für Zeitgrenzen kontrolliert, ohne Datenbank-Timer anzuhalten.
-  `permissions.test.ts`: Benutzer-/App-Isolation, verschachtelte Tabellenabfragen,
   vorhandene Lesefreigaben und Aliase, abgelehnte Änderungen ohne Auswirkungen
   auf Datenbank, Cache oder Dateien. Die Vergabe neuer Freigaben ist noch nicht
   Gegenstand dieser Suite.
-  `redis.test.ts`: GraphQL-CRUD mit Property-Typen, BigInt-Serialisierung und
   konsistenten ETags, entfernte/aktualisierte Schlüssel sowie persistierte
   Wiederholungen nach einem ausgefallenen Redis-Client und Wiederverbindung.

Die Regressionstests sichern vier dabei behobene Fehler: Session-Löschung wird
abgewartet; neu berechnete ETags werden auch im zurückgegebenen Objekt aktualisiert;
Redis-Property-Werte werden als Strings übertragen; beim Abgleich werden nur
tatsächlich obsolete Property-Schlüssel gelöscht. Dafür sind keine Schemaänderungen
oder Datenmigrationen erforderlich.

Weitere Kontoabläufe, Upload-Konsistenz, Zahlungen und Webhook-Wiederholungen
folgen in der nächsten fachlichen Teststufe. Das bisherige Verhalten bei fehlendem
Stripe-Webhook-Secret ist in diesem Schritt nicht geändert worden.
