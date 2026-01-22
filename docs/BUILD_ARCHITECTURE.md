# Kompilierung & Build-Architektur

Dieses Dokument beschreibt, wie die n8n "Main-Packages" kompiliert und zusammengebaut werden.

## Build-Pipeline (Turbo)

n8n verwendet **Turbo** (`turbo.json`) zur Orchestrierung der Build-Tasks.

### Ablauf (`pnpm build`)

1. **Vorbereitung:** Skripte prüfen Node-Versionen und Umgebung.
2. **Abhängigkeiten:** Turbo analysiert den Dependency-Graphen (`dependencies` in `package.json`).
3. **Kompilierung:** Pakete werden in topologischer Reihenfolge gebaut:
    * Basispakete (`workflow`, `api-types`, `utils`) zuerst.
    * `editor-ui` (Frontend).
    * `nodes-base` (Nodes).
    * `cli` (Backend/Server) als letztes, da es von fast allem abhängt.

### Tools

* **TypeScript (`tsc`):** Wird für fast alle Backend-Pakete (`cli`, `core`, `nodes-base`) verwendet, um `.ts` nach `.js` (in `dist/`) zu kompilieren.
* **Vite:** Wird für das `editor-ui` Frontend verwendet, um Vue-Komponenten zu bündeln und zu optimieren.
* **Vue-TSC:** Type-Checking für Vue-Dateien.

## Public API & Swagger UI Erstellung

Ein spezieller Fall ist die Erstellung der Public API Dokumentation und der Swagger UI. Diese erfolgt **nicht** automatisch durch den TypeScript-Compiler.

### Der Prozess (`scripts/build.mjs`)

Das Paket `packages/cli` besitzt ein `build:data` Skript (`node scripts/build.mjs`), welches nach der Kompilierung läuft. Dieses Skript ist entscheidend für die Funktionalität der API-Dokumentation.

1. **Prüfung:** Es prüft die Environment-Variable `N8N_PUBLIC_API_DISABLED` **zur Build-Zeit**. Ist diese `true`, werden die folgenden Schritte übersprungen.
2. **Verzeichnis:** Erstellt `dist/public-api`.
3. **Swagger UI:** Kopiert `swagger-theme.css`.
4. **OpenAPI Spec:** Nutzt `@redocly/cli` (`pnpm openapi bundle`), um aus den Quelldateien (`src/public-api/**/*.yml`) eine gebündelte `dist/public-api/v1/openapi.yml` zu erzeugen.

**Wichtig für selbst kompilierte Versionen:**
Wenn Sie n8n selbst bauen und die API nutzen wollen, müssen Sie sicherstellen, dass:

* Der Befehl `pnpm run build:data` im `packages/cli` Verzeichnis erfolgreich durchläuft.
* Die Variable `N8N_PUBLIC_API_DISABLED` während des Builds **nicht** auf `true` gesetzt ist.
* Die Abhängigkeit `@redocly/cli` installiert ist (Dev-Dependency).

## Aktivierung der Packages

Wie weiß das n8n-CLI, wo die Komponenten zu finden sind?

### 1. Frontend (`editor-ui`)

Das Frontend wird nach `packages/editor-ui/dist` kompiliert. Das `cli` Paket hat Code (in `src/Server.ts` o.ä.), der statische Dateien uns diesem Verzeichnis serviert, wenn der Server startet.

### 2. Nodes (`nodes-base`)

Die Nodes werden dynamisch geladen.

* Beim Build werden `package.json` und Verzeichnisstrukturen analysiert.
* Die `core` Engine lädt beim Start alle Nodes, die in den bekannten Pfaden (definiert in `cli` config) gefunden werden.
* Im Monorepo-Dev-Modus zeigen Symlinks (via `pnpm workspace`) auf die kompilierten Ordner.

## Build-Skripte

Wichtige Skripte im Root `package.json`:

* `"build"`: Führt `turbo run build` aus. Baut alles inkrementell.
* `"build:n8n"`: Ein spezialisiertes Skript (`scripts/build-n8n.mjs`), das einen Deployment-fähigen Build erzeugt, indem es nur notwendige Dateien in einen `compiled/` Ordner kopiert (für Docker-Images).
* `"dev"`: Startet `turbo run dev` für paralleles Watching von Frontend und Backend.

## CI/CD Integration

Die Pipeline ist darauf ausgelegt, dass:

1. Code gepusht wird.
2. CI `pnpm install` und `pnpm build` ausführt.
3. Tests (`pnpm test`) gegen die kompilierten Artefakte laufen.
4. Docker-Images aus dem Output von `build:n8n` erstellt werden.
