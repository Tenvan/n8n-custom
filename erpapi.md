# ErpApi-Deploy: Build- und Packaging-Ablauf

Dieses Repository ist ein Fork von n8n mit orgaMAX-spezifischen Anpassungen. Das
Ziel des Deploys sind `.tgz`-Archive aller Workspace-Packages, die das
ErpApi-Projekt per `file:`-Link in seiner `package.json` einbindet.

## Branch-Modell

| Branch | Zweck | Regel |
| --- | --- | --- |
| `master` | Spiegel des Upstream-Stands von `n8n-io/n8n` | Nicht anfassen. Bleibt sauber, damit jederzeit gegen Upstream rebased werden kann. |
| `custom-erpapi` | Deploy-Branch mit allen Fork-Anpassungen | Hier wird entwickelt, gebaut und gepackt. |
| `develop` | Alter Fork-Stand (v2.5.0, Januar 2026) | Historie. Wurde nach `custom-erpapi` überführt und ist nicht mehr aktuell. |

```mermaid
%%{init: {'theme': 'dark'}}%%
gitGraph
    commit id: "upstream n8n"
    commit id: "master (2.37.0)"
    branch custom-erpapi
    commit id: "license activation"
    commit id: "orgaMAX branding"
    commit id: "local IPC auth"
    commit id: "deploy tooling"
```

Upstream-Updates werden auf `master` gezogen und von dort in `custom-erpapi`
gemerged oder rebased — nie umgekehrt.

## Voraussetzungen

| Werkzeug | Version | Prüfen mit |
| --- | --- | --- |
| Node.js | `>=24.0.0` | `node -v` |
| pnpm | `>=11.22.0` | `pnpm -v` |

Eine ältere pnpm-Version erzeugt einen inkonsistenten `node_modules`-Baum. Das
äußert sich als Typecheck-Fehler in scheinbar unbeteiligten Packages, etwa
Versionskonflikte zwischen zwei `@typescript-eslint/types`-Ständen in
`@n8n/eslint-plugin-community-nodes`.

## Der Ablauf

```mermaid
%%{init: {'theme': 'dark'}}%%
flowchart LR
    A[pnpm install] --> B[pnpm build]
    B --> C[pnpm deploy:packages]
    C --> D[".deploy/*.tgz"]
    D --> E["Kopie nach<br/>ErpApi/packages/"]
    E --> F["file:-Links in<br/>ErpApi/package.json"]
```

### 1. Dependencies installieren

```bash
git switch custom-erpapi
pnpm install --frozen-lockfile
```

Dauert bei leerem `node_modules` mehrere Minuten. Die Warnungen
`Failed to create bin at ... workflow-sdk` sind erwartbar — die Bin-Links zeigen
auf `dist`-Dateien, die erst der Build erzeugt. Sie lösen sich mit Schritt 2.

**Ohne diesen Schritt schlägt jeder Build sofort fehl.** Das war die Ursache des
zuletzt fehlgeschlagenen Builds: `node_modules` fehlte komplett.

### 2. Bauen

```bash
pnpm build > build.log 2>&1
tail -n 20 build.log
```

Der Build umfasst 70 Turbo-Tasks. Bei kaltem Cache dauert er etwa 10–15 Minuten,
`n8n-editor-ui` allein rund eine Minute.

Nach dem Build meldet `git status` rund 43 geänderte `.generated.yml`-Dateien
unter `packages/cli/src/public-api/`. Das ist **kein** inhaltlicher Unterschied,
sondern reines CRLF/LF-Rauschen: der Generator schreibt LF, `core.autocrlf=true`
will CRLF. `git diff` auf diese Dateien ist leer. Verwerfen mit:

```bash
git checkout -- packages/cli/src/public-api
```

Wer das dauerhaft loswerden will, ergänzt `.gitattributes` um
`*.generated.yml text eol=lf`.

Bei stale Build-Outputs (etwa nach einem Branch-Wechsel) hilft `pnpm reset`; erst
wenn das nicht reicht, `pnpm reset --full` (wirft `node_modules` weg und
installiert neu).

### 3. Packages packen

```bash
pnpm deploy:packages
```

| Befehl | Wirkung |
| --- | --- |
| `pnpm deploy:packages` | Packt nach `.deploy/`. Setzt einen abgeschlossenen Build voraus. |
| `pnpm deploy:packages:build` | Baut vorher (`pnpm build && …`). |
| `pnpm deploy:packages:dry-run` | Listet nur, was gepackt würde. |

Ergebnis: 65 Tarballs plus `packing-manifest.json` in `.deploy/`, zusammen rund
49 MB. Der Ordner ist gitignored.

Das Skript (`scripts/deploy-packages.mjs`) arbeitet in dieser Reihenfolge:

1. Alle `packages/**/package.json` einsammeln, die nicht `private: true` sind.
2. Abbrechen, falls `packages/cli/dist` fehlt — sonst entstünden leere Tarballs.
3. `.deploy/` leeren.
4. Die drei Frontend-Manifeste sichern, die `trim-fe-packageJson.js` umschreibt
   (`@n8n/chat`, `@n8n/design-system`, `editor-ui`), und den Trim ausführen. Er
   entfernt `scripts`, `devDependencies` und bei `editor-ui` auch `dependencies`,
   damit die Tarballs keinen Dev-Ballast in ErpApi einschleppen.
5. Jedes Package mit `pnpm pack --pack-destination` packen und prüfen, dass die
   erwartete Datei entstanden ist.
6. Die gesicherten Manifeste im `finally`-Block zurückrollen — auch wenn das
   Packen mittendrin abbricht.

Wird der Lauf hart abgebrochen (Ctrl+C, Task-Kill), greift Schritt 6 nicht und
die drei Manifeste bleiben getrimmt liegen. Der nächste Lauf erkennt das und
bricht mit dem passenden `git restore`-Befehl ab, statt den getrimmten Zustand
als neues Backup zu sichern.

### 4. Nach ErpApi übernehmen

```bash
cp .deploy/*.tgz /c/WORKSPACE/ErpApi/packages/
```

Danach müssen die `file:`-Links in `ErpApi/package.json` auf die neuen
Versionsnummern zeigen. Beim Sprung von 2.5.0 auf 2.37.0 ändert sich praktisch
jede Version. Aus dem Manifest lässt sich das automatisch ableiten:

```bash
node -e "
const fs = require('fs');
const manifest = require('./.deploy/packing-manifest.json');
const pkgPath = '/c/WORKSPACE/ErpApi/package.json';
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
let changed = 0;
for (const { name, file } of manifest.packages) {
  if (pkg.dependencies?.[name]?.startsWith('file:')) {
    pkg.dependencies[name] = 'file:packages/' + file;
    changed++;
  }
}
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
console.log(changed + ' file:-Links aktualisiert');
"
```

Alte Tarballs im Zielordner vorher löschen, sonst sammeln sich mehrere Versionen
desselben Packages an.

## Was sich gegenüber v2.5.0 geändert hat

Der letzte Deploy (`C:\WORKSPACE\packages\2.5.0`) enthielt 42 Packages, der
aktuelle Stand hat 65. Neu hinzugekommen sind unter anderem `@n8n/agents`,
`@n8n/engine`, `@n8n/crdt`, `@n8n/telemetry`, `@n8n/typeorm`, `@n8n/scheduler`,
`@n8n/instance-ai`, `@n8n/expression-runtime`, `@n8n/workflow-sdk`,
`@n8n/blob-storage`, `@n8n/mcp-apps`, `@n8n/mcp-browser` und mehrere
`@n8n/frontend-*`-Packages.

Weggefallen ist `n8n-node-dev`; an seine Stelle tritt `@n8n/cli`.

ErpApi bindet aktuell 42 Packages per `file:`-Link ein. Ob die neuen Packages
dort gebraucht werden, hängt davon ab, welche n8n-Einstiegspunkte ErpApi nutzt —
`n8n` selbst zieht sie als Dependencies nach, dann müssen sie ebenfalls als
`file:`-Link vorliegen, sonst holt npm die Registry-Version.

## Fork-Anpassungen

Alle Eingriffe in Upstream-Code sind mit `[CUSTOM-FORK]` markiert. Vor jedem
Rebase lohnt sich:

```bash
grep -rn "CUSTOM-FORK" packages/ --include=*.ts --include=*.vue
```

| Bereich | Dateien | Wirkung |
| --- | --- | --- |
| Lizenz | `packages/cli/src/license.ts`, `license/license.service.ts`, `commands/base-command.ts` | `init()` aktiviert lokal einen Enterprise-Plan, statt das LicenseManager-SDK zu starten. Aktivierung, Renewal und Trial-Registrierung sind No-Ops ohne externe Calls. |
| Authentifizierung | `packages/cli/src/auth/auth.service.ts` | `createAuthMiddleware` ruft bedingungslos `next()` auf. Es findet **keine** Anmeldeprüfung mehr statt. |
| Public API | `packages/cli/src/services/local-ipc-auth.strategy.ts`, `server.ts` | Requests von Loopback-Adressen werden als Instance-Owner authentifiziert, damit ErpApi die Public API ohne API-Key anspricht. |
| Branding | `OrgaMaxLogo.vue`, `MainSidebarHeader.vue`, `AuthView.vue`, `CustomFeaturesPanel.vue`, `public/static/logos/` | orgaMAX-Logo in Sidebar und Login. |

### Konventionen für Fork-Eingriffe

Damit Rebases beherrschbar bleiben, gelten drei Regeln, die beim Heben auf 2.37.0
angewendet wurden:

- **Upstream-Signaturen unverändert lassen.** Der alte Fork hatte
  Konstruktor-Parameter aus `License` und `LicenseService` entfernt. Das brach 14
  Upstream-Tests und erzeugte Folgefehler. Jetzt bleiben die Signaturen
  identisch; nicht mehr genutzte Parameter tragen ein `_`-Präfix.
- **Keine auskommentierten Original-Blöcke.** Der alte Fork behielt den
  ersetzten Upstream-Code als Kommentar. Das hielt Hilfsmethoden künstlich am
  Leben, erzeugte 24 Typecheck-Fehler und kollidiert bei jedem Rebase. Das
  Original steht in `master` — ein Verweis genügt.
- **Erweiterungspunkte nutzen, statt zu patchen.** Der IPC-Bypass hing
  ursprünglich als Middleware plus zwei Bypass-Blöcke in
  `public-api-key.service.ts`. Master bietet mit `AuthStrategyRegistry` einen
  vorgesehenen Registrierungspunkt. Der Fork berührt damit eine einzige
  Upstream-Zeile statt vier Patch-Blöcke.

## Bekannte Punkte

### Authentifizierung ist vollständig abgeschaltet

`createAuthMiddleware` lässt jeden Request durch — nicht nur lokale. Wer die
Instanz über das Netz erreicht, hat vollen Zugriff auf UI und API ohne
Anmeldung. Die Instanz darf deshalb ausschließlich an `127.0.0.1` gebunden
betrieben werden (`N8N_LISTEN_ADDRESS=127.0.0.1`), niemals an `0.0.0.0`.

Der IPC-Bypass in `LocalIpcAuthStrategy` wäre für den ErpApi-Anwendungsfall
allein ausreichend und ist auf Loopback beschränkt. Der pauschale
`next()`-Aufruf in `auth.service.ts` geht deutlich darüber hinaus — falls er
nicht gebraucht wird, ist sein Entfernen die wirksamste Härtung.

### Localhost-Erkennung

`LocalIpcAuthStrategy` wertet nur `req.socket.remoteAddress` aus. Die
ursprüngliche Fassung akzeptierte zusätzlich `X-Forwarded-For` und `Host` als
Beleg für Localhost — beide sind client-kontrolliert, ein entfernter Angreifer
hätte mit `X-Forwarded-For: 127.0.0.1` Owner-Rechte auf der Public API erhalten.
Diese Auswertung wurde beim Heben entfernt; zwei Tests decken die
Spoofing-Versuche ab.

### Lizenzstatus

Die lokale Enterprise-Aktivierung umgeht die Lizenzprüfung für Features, die
unter `LICENSE_EE.md` stehen. Das ist eine lizenzrechtliche Frage, keine
technische.

### Tests unter Windows ausführen

Die `test`-Scripts der Packages setzen Environment-Variablen in POSIX-Syntax
(`N8N_LOG_LEVEL=silent vitest run`). pnpm führt Scripts unter Windows über
`cmd.exe` aus, wo das als Befehlsname interpretiert wird:

```text
Der Befehl "N8N_LOG_LEVEL" ist entweder falsch geschrieben oder
konnte nicht gefunden werden.
```

Aus der Git Bash funktioniert stattdessen der direkte Aufruf:

```bash
cd packages/cli
N8N_LOG_LEVEL=silent DB_TYPE=sqlite DB_SQLITE_POOL_SIZE=4 \
  pnpm exec vitest run src/services/__tests__/local-ipc-auth.strategy.test.ts
```

Typecheck analog:

```bash
cd packages/cli && pnpm exec tsc --noEmit -p tsconfig.json
```

### Windows-Pfade als Prozessargument

`pnpm pack --pack-destination C:\WORKSPACE\n8n-custom\.deploy` scheitert, weil
`\n` als Escape-Sequenz gedeutet wird:

```text
ENOENT: no such file or directory, mkdir 'C:\WORKSPACE
8n-custom\.deploy'
```

Das Deploy-Skript übergibt den Pfad deshalb mit Forward-Slashes. Wer weitere
Skripte ergänzt, die Pfade an externe Prozesse reichen, sollte dasselbe tun.

## Verbesserungsvorschläge

- `.gitattributes` um `*.generated.yml text eol=lf` ergänzen, damit der Build
  keinen Dirty-State mehr hinterlässt.
- Den pauschalen `next()`-Aufruf in `auth.service.ts` prüfen: wenn ErpApi nur
  über die Public API spricht, reicht `LocalIpcAuthStrategy`.
- Einen Schritt ergänzen, der die `file:`-Links in `ErpApi/package.json`
  automatisch aus dem `packing-manifest.json` aktualisiert, statt den Node-Aufruf
  aus Abschnitt 4 von Hand auszuführen.

## Nächste Schritte

- [ ] Prüfen, welche der 23 neuen Packages ErpApi tatsächlich als `file:`-Link
      braucht.
- [ ] Einen Smoke-Test definieren, der nach dem Deploy bestätigt, dass ErpApi die
      n8n-Public-API über Loopback ohne API-Key erreicht.
- [ ] Entscheiden, ob der pauschale `next()`-Aufruf in `auth.service.ts` bleiben
      soll oder `LocalIpcAuthStrategy` allein genügt.

## Verifizierter Stand

Stand 27.08.2026 auf `custom-erpapi`, n8n 2.37.0:

| Schritt | Ergebnis |
| --- | --- |
| `pnpm install --frozen-lockfile` | exit 0 |
| `pnpm build` | exit 0, 70 Tasks, 0 TypeScript-Fehler |
| `pnpm exec tsc --noEmit` in `packages/cli` | exit 0 |
| Tests der berührten Suites | 53 grün |
| `pnpm deploy:packages` | exit 0, 65 von 65 Packages, 49,4 MB |
