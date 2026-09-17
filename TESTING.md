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

Die Prisma-Generierung benötigt keine Verbindung zur Datenbank. Die Tests
benötigen weder PostgreSQL noch Redis noch echte Zugangsdaten und laden keine
`.env`. HTTP-Tests öffnen kurzlebige lokale Ports; eine Sandbox muss dies erlauben.
Nock sperrt ausgehende externe HTTP-Anfragen. PostgreSQL-/Redis-Clients werden
in dieser ersten Stufe ausschließlich durch Test-Doubles ersetzt.

```sh
npm run test:watch
npm run test:coverage
```

Der Coverage-Bericht liegt unter `coverage/index.html`. Es gibt vorerst keine
Mindestquote: Die erste Suite sichert die neue Anwendungsstruktur ab, noch nicht
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
- `tests/helpers/dependencies.ts`: kleine Test-Doubles; unvorbereitete externe
  Operationen schlagen fehl.

GraphQL-Tests mit `executeOperation` umgehen die HTTP-Middleware. Header,
Body-Parser und Routing deshalb über Supertest prüfen. GraphQL-Fehler anhand
von `errors[].extensions.code` prüfen, nicht allein am HTTP-Status.

Nächste Stufe: isolierte PostgreSQL-/Redis-Dienste, Fixtures und Integrationstests
für Sessions, Berechtigungen und Datenkonsistenz. CI und Server-Systemtests folgen
separat. Die bisherigen fachlichen Fehlerpfade, einschließlich des Verhaltens
bei fehlendem Webhook-Secret, werden durch dieses Struktur-Refactoring nicht
inhaltlich geändert.
