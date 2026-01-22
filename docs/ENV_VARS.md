# Umgebungsvariablen (ENV)

n8n verwendet eine Vielzahl von Umgebungsvariablen für die Konfiguration. Diese werden im Code über das `@n8n/config` Package verwaltet.

## Wichtige Variablen

Hier finden Sie eine kategorisierte Liste der wichtigsten Variablen.

### 1. Allgemein & Server

| ENV-Variable         | Beschreibung                                                                                             | Standardwert       | Typ    |
| -------------------- | -------------------------------------------------------------------------------------------------------- | ------------------ | ------ |
| `N8N_PORT`           | Port, auf dem n8n lauscht                                                                                | `5678`             | Number |
| `N8N_HOST`           | Hostname/IP für den Server                                                                               | `localhost`        | String |
| `N8N_PROTOCOL`       | Protokoll für den Zugriff (`http` oder `https`)                                                          | `http`             | String |
| `WEBHOOK_URL`        | Öffentliche URL für Webhooks. Zwingend für OAuth und externe Trigger.                                    | (leer)             | String |
| `GENERIC_TIMEZONE`   | Standard-Zeitzone für Workflows (z.B. `Europe/Berlin`)                                                   | `America/New_York` | String |
| `N8N_ENCRYPTION_KEY` | Schlüssel zur Verschlüsselung von Credentials. **Kritisch:** Bei Verlust sind alle Credentials verloren. | (Generiert)        | String |

### 2. Datenbank (PostgreSQL)

Für Produktionsumgebungen empfohlen.

| ENV-Variable             | Beschreibung                           | Standardwert | Typ    |
| ------------------------ | -------------------------------------- | ------------ | ------ |
| `DB_TYPE`                | Datenbank-Typ (`sqlite`, `postgresdb`) | `sqlite`     | String |
| `DB_POSTGRESDB_HOST`     | Hostname der Datenbank                 | `localhost`  | String |
| `DB_POSTGRESDB_PORT`     | Port der Datenbank                     | `5432`       | Number |
| `DB_POSTGRESDB_DATABASE` | Name der Datenbank                     | `n8n`        | String |
| `DB_POSTGRESDB_USER`     | Benutzername                           | `root`       | String |
| `DB_POSTGRESDB_PASSWORD` | Passwort                               | (leer)       | String |

### 3. Sicherheit & Auth

| ENV-Variable                         | Beschreibung                                                                          | Standardwert                                                           | Typ         |
| ------------------------------------ | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ----------- |
| `N8N_BASIC_AUTH_ACTIVE`              | Aktiviert Basic Auth für den Zugriff                                                  | `false`                                                                | Boolean     |
| `N8N_BASIC_AUTH_USER`                | Basic Auth Benutzername                                                               | (leer)                                                                 | String      |
| `N8N_BASIC_AUTH_PASSWORD`            | Basic Auth Passwort                                                                   | (leer)                                                                 | String      |
| `N8N_JWT_AUTH_HEADER`                | Header Name für JWT Authentifizierung                                                 | `X-N8N-Auth-Token`                                                     | String      |
| `N8N_RESTRICT_FILE_ACCESS_TO`        | Erlaubte Pfade für Datei-Lese/Schreib-Nodes (getrennt durch `;`)                      | `~/.n8n-files`                                                         | String      |
| `N8N_BLOCK_FILE_ACCESS_TO_N8N_FILES` | Blockiert Zugriff auf interne n8n Konfigurationsdateien                               | `true`                                                                 | Boolean     |
| `NODES_EXCLUDE`                      | JSON-Array von Node-Typen, die deaktiviert werden sollen (z.B. für `Execute Command`) | `["n8n-nodes-base.executeCommand", "n8n-nodes-base.localFileTrigger"]` | JSON String |

### 4. Public API

Steuerung der öffentlichen n8n API.

| ENV-Variable                        | Beschreibung                                                                                                                           | Standardwert | Typ     |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ------- |
| `N8N_PUBLIC_API_DISABLED`           | Deaktiviert die gesamte Public API. **Wichtig:** Wird diese Variable beim **Build** gesetzt, werden Swagger-Dateien gar nicht erstellt. | `false`      | Boolean |
| `N8N_PUBLIC_API_ENDPOINT`           | URL-Pfad-Segment für die API                                                                                                           | `api`        | String  |
| `N8N_PUBLIC_API_SWAGGERUI_DISABLED` | Deaktiviert die Swagger UI Dokumentation (`/api/v1/docs`)                                                                              | `false`      | Boolean |

### 5. Ausführung & Historie (Executions)

Konfiguration, wie Workflows ausgeführt und gespeichert werden.

| ENV-Variable                                 | Beschreibung                                                              | Standardwert    | Typ     |
| -------------------------------------------- | ------------------------------------------------------------------------- | --------------- | ------- |
| `EXECUTIONS_MODE`                            | Modus: `regular` (Single Process) oder `queue` (Scaling Mode mit Workers) | `regular`       | String  |
| `EXECUTIONS_TIMEOUT`                         | Max. Laufzeit einer Ausführung in Sekunden (`-1` für unbegrenzt)          | `-1`            | Number  |
| `EXECUTIONS_DATA_PRUNE`                      | Aktiviert das automatische Löschen alter Ausführungsdaten                 | `true`          | Boolean |
| `EXECUTIONS_DATA_MAX_AGE`                    | Alter in Stunden, ab dem Ausführungen gelöscht werden (Soft Delete)       | `336` (14 Tage) | Number  |
| `EXECUTIONS_DATA_PRUNE_MAX_COUNT`            | Max. Anzahl gespeicherter Ausführungen (Rotation)                         | `10000`         | Number  |
| `EXECUTIONS_DATA_PRUNE_HARD_DELETE_INTERVAL` | Intervall (Minuten) für das endgültige Löschen aus der DB                 | `15`            | Number  |

### 6. AI Features

| ENV-Variable         | Beschreibung                            | Standardwert   | Typ     |
| -------------------- | --------------------------------------- | -------------- | ------- |
| `N8N_AI_ENABLED`     | Aktiviert AI-Funktionalitäten im Editor | `false`        | Boolean |
| `N8N_AI_TIMEOUT_MAX` | Timeout für AI-Anfragen in ms           | `3600000` (1h) | Number  |

### 7. Metriken & Logging

| ENV-Variable         | Beschreibung                                           | Standardwert | Typ     |
| -------------------- | ------------------------------------------------------ | ------------ | ------- |
| `N8N_LOG_LEVEL`      | Detailgrad der Logs (`debug`, `info`, `warn`, `error`) | `info`       | String  |
| `N8N_METRICS`        | Aktiviert den `/metrics` Endpoint für Prometheus       | `false`      | Boolean |
| `N8N_METRICS_PREFIX` | Präfix für Metriken                                    | `n8n_`       | String  |

## Konfiguration setzen

### Docker Compose

```yaml
environment:
  - N8N_PORT=5678
  - DB_TYPE=postgresdb
  - EXECUTIONS_DATA_PRUNE=true
```

### Datei-Uploads & Speicher

Für spezifische Anpassungen (wie Upload-Limits) prüfen Sie auch `data-table.config.ts` und `binary-data.config.ts`.
