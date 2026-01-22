# Deployment

Dieses Dokument richtet sich an DevOps-Ingenieure und beschreibt Deployment-Strategien für n8n.

## Unterstützte Umgebungen

* **Docker (Empfohlen):** Offizielle Images verfügbar.
* **Kubernetes:** Skalierbares Deployment via Helm-Charts (separat verfügbar) oder Manifests.
* **Node.js direkt:** Deployment auf VM/Bare-Metal (siehe Installationsanleitung).

## 1. Docker Deployment

Docker ist die bevorzugte Methode für das Deployment von n8n.

### Offizielles Image

Das Basis-Image `n8nio/n8n` basiert auf Alpine Linux, um die Größe gering zu halten.

### Start via Docker CLI

```bash
docker run -it --rm --name n8n \
  -p 5678:5678 \
  -v ~/.n8n:/home/node/.n8n \
  n8nio/n8n
```

* `-v ~/.n8n:/home/node/.n8n`: Persistiert Daten (Datenbank, SSH Keys) auf dem Host.
* `-p 5678:5678`: Öffnet den Web-Port.

### Docker Compose (Empfohlen)

Für komplexere Setups (z.B. mit Postgres statt SQLite) ist Docker Compose ideal.

#### Beispiel `docker-compose.yml`

```yaml
version: "3"
services:
  n8n:
    image: n8nio/n8n
    ports:
      - "5678:5678"
    environment:
      - N8N_HOST=n8n.example.com
      - N8N_PORT=5678
      - N8N_PROTOCOL=https
      - NODE_ENV=production
      - WEBHOOK_URL=https://n8n.example.com/
      - GENERIC_TIMEZONE=Europe/Berlin
    volumes:
      - n8n_data:/home/node/.n8n
    restart: always

volumes:
  n8n_data:
```

## 2. Datenbank-Konfiguration (Produktion)

Standardmäßig nutzt n8n **SQLite**. Für Produktionsumgebungen wird **PostgreSQL** dringend empfohlen.

Setzen Sie folgende Umgebungsvariablen für PostgreSQL:

* `DB_TYPE=postgresdb`
* `DB_POSTGRESDB_HOST=<host>`
* `DB_POSTGRESDB_PORT=5432`
* `DB_POSTGRESDB_DATABASE=n8n`
* `DB_POSTGRESDB_USER=<user>`
* `DB_POSTGRESDB_PASSWORD=<password>`

## Überwachung & Logging

* **Logs:** Standardmäßig schreibt n8n Logs nach `stdout` (JSON oder Text).
* **Konfiguration:**
  * `N8N_LOG_LEVEL`: `info`, `debug`, `warn`, `error`.
  * `N8N_LOG_OUTPUT`: `console`, `file`.

## Updates & Rollback

### Update

1. `docker pull n8nio/n8n:latest`
2. `docker-compose up -d`

### Rollback

Ändern Sie das Tag im `docker-compose.yml` auf die vorherige Version (z.B. `n8nio/n8n:1.0.0`) und starten Sie neu.

**Achtung:** Datenbank-Migrationen werden beim Start automatisch durchgeführt. Ein Downgrade der Software kann zu Fehlern führen, wenn die Datenbankstruktur bereits für eine neuere Version aktualisiert wurde. Backups sind essenziell.
