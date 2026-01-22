# Packages & Architektur

n8n ist als Monorepo organisiert und nutzt `pnpm workspaces`. Dieses Dokument gibt einen Überblick über die Paketstruktur.

## Übersicht

Der Code ist in `packages/` unterteilt. Die wichtigsten Pakete sind:

| Paket             | Pfad                          | Beschreibung                                                                                                                              |
| ----------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **cli**           | `packages/cli`                | Der Haupt-Einstiegspunkt. Enthält den Server, die CLI-Befehle (`n8n start`, `n8n worker`) und orchestriert das Laden anderer Komponenten. |
| **core**          | `packages/core`               | Die Workflow-Engine. Verantwortlich für die Ausführung von Workflows, das Management von Execution-Daten und Node-Logik.                  |
| **editor-ui**     | `packages/editor-ui`          | Das Frontend (Vue.js 3). Enthält den Workflow-Editor und die gesamte Benutzeroberfläche.                                                  |
| **workflow**      | `packages/workflow`           | Definiert Basis-Interfaces (`INodeType`, `IWorkflowExecuteData`) und Typen, die sowohl von Frontend als auch Backend genutzt werden.      |
| **nodes-base**    | `packages/nodes-base`         | Enthält die integrierten Standard-Nodes (z.B. HTTP Core Integrationen, Tools). Dies ist das größte Paket.                                 |
| **design-system** | `packages/@n8n/design-system` | UI-Komponentenbibliothek für konsistentes Design im Frontend.                                                                             |
| **config**        | `packages/@n8n/config`        | Zentrale Verwaltung von Konfigurationsschemata und Umgebungsvariablen.                                                                    |

## Paket-Manager

* **Manager:** `pnpm`
* **Konfiguration:** `pnpm-workspace.yaml` im Root definiert die Workspace-Struktur.

## Abhängigkeiten

Die Pakete sind stark voneinander abhängig. Ein typischer Ablauf:

1. `cli` lädt `core` zum Starten der Engine.
2. `cli` serviert die statischen Dateien aus `editor-ui/dist`.
3. `core` lädt Nodes aus `nodes-base`.
4. Alle Pakete nutzen Typen aus `workflow` und `@n8n/api-types`.

## Aktualisierung von Abhängigkeiten

Im Monorepo sollten Abhängigkeiten synchron gehalten werden.

```bash
# Hinzufügen einer Abhängigkeit zu einem spezifischen Package
pnpm add <package-name> --filter <workspace-package>

# Beispiel: lodash zu Packages/core hinzufügen
pnpm add lodash --filter n8n-core
```

## Package-Identifikation

Jedes Package besitzt eine `package.json` mit spezifischen Metadaten:

* `name`: Eindeutiger Name (z.B. `n8n-core`, `n8n-editor-ui`).
* `main`: Einstiegspunkt (oft `dist/index.js`).
* `files`: Definiert, welche Dateien beim Publishing enthalten sind.
