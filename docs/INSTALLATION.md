# Installation

Dieses Dokument beschreibt die Schritte zur Installation von n8n, sowohl für Entwicklungszwecke als auch für den produktiven Einsatz.

## Voraussetzungen

### Betriebssystem

n8n läuft auf den meisten modernen Betriebssystemen:

* Ubuntu 20.04+ / Debian 11+
* Windows 10/11 (bevorzugt via WSL2)
* macOS

### Software

* **Node.js**: Version 22.16 oder höher erforderlich.
* **Paketmanager**: `pnpm` Version 10.22.0 oder höher.
  * Es wird empfohlen, `corepack` zu verwenden, um die korrekte `pnpm` Version sicherzustellen.

### Hardware (Empfohlen)

* **CPU**: 2 Kerne+
* **RAM**: 2GB+ (für einfache Workflows), 4GB+ empfohlen.
* **Speicher**: Abhängig von der Datenbankgröße und Logging-Einstellungen.

## Installationsmethoden

### 1. NPM (Produktions-ähnlich / Global)

Der einfachste Weg, n8n ohne Docker zu installieren, ist über `npm`.

```bash
# Node.js Installation wird vorausgesetzt
npm install n8n -g

# Starten
n8n start
```

### 2. Entwicklungsumgebung (Quellcode)

Für Entwickler, die am n8n-Codebase arbeiten möchten.

#### Schritte

1. **Repository klonen:**

    ```bash
    git clone https://github.com/n8n-io/n8n.git
    cd n8n
    ```

2. **Corepack aktivieren (optional aber empfohlen):**

    ```bash
    corepack enable
    corepack prepare --activate
    ```

3. **Abhängigkeiten installieren:**
    Führen Sie diesen Befehl im Root-Verzeichnis aus:

    ```bash
    pnpm install
    ```

4. **Projekt bauen:**
    Dadurch werden alle Packages im Monorepo gebaut (Frontend und Backend).

    ```bash
    pnpm build
    ```

5. **Starten:**

    ```bash
    pnpm start
    ```

    Der Server ist standardmäßig unter `http://localhost:5678` erreichbar.

## Konfiguration nach der Installation

Nach dem ersten Start erstellt n8n automatisch einen `.n8n` Ordner im Home-Verzeichnis des Benutzers (z.B. `~/.n8n`). Dieser enthält:

* `config`: Konfigurationsdatei (falls vorhanden).
* `database.sqlite`: Die Standard-SQLite-Datenbank.

## Fehlerbehebung

* **Problem:** `pnpm` nicht gefunden.
  * *Lösung:* Stellen Sie sicher, dass `corepack enable` ausgeführt wurde oder installieren Sie pnpm global via `npm i -g pnpm`.
* **Problem:** Build-Fehler im Frontend.
  * *Lösung:* Versuchen Sie `pnpm run clean` gefolgt von `pnpm install` und `pnpm build`, um Caches zu leeren.
* **Problem:** SQLite-Fehler beim Start.
  * *Lösung:* n8n benötigt native Module. Stellen Sie sicher, dass Python und Build-Tools (wie `build-essential` unter Linux oder Visual Studio Build Tools unter Windows) installiert sind.
