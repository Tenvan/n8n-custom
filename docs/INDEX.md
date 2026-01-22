# n8n AI-Ready Dokumentation

Diese Sammlung von Dokumenten bietet einen detaillierten, technischen Überblick über das n8n Projekt, optimiert für das Verständnis durch KI-Agenten und Entwickler.

## Inhaltsverzeichnis

1. [**Installation**](INSTALLATION.md)
    * Voraussetzungen (Node.js, pnpm)
    * Schritt-für-Schritt Installation (Source & NPM)

2. [**Deployment**](DEPLOYMENT.md)
    * Docker & Docker Compose Strategien
    * Datenbank-Setup (Postgres)
    * Produktions-Konfiguration

3. [**Packages**](PACKAGES.md)
    * Struktur des Monorepos
    * Erklärung der Kern-Pakete (`cli`, `core`, `editor-ui`)
    * Abhängigkeitsmanagement

4. [**ENV-Variablen**](ENV_VARS.md)
    * Liste wichtiger Umgebungsvariablen
    * Kategorien: Server, Datenbank, Sicherheit, Public API, Executions, AI
    * Datentypen und Standardwerte

5. [**Build Architektur**](BUILD_ARCHITECTURE.md)
    * Funktionsweise der Turbo-Pipeline
    * Kompilierung von Backend (TSC) und Frontend (Vite)
    * Laden und Aktivierung von Modulen    *   Besonderheiten bei der API-Erstellung

## Metadaten & Analyse-Hinweise

Für zukünftige Analysen durch KI-Agenten oder Entwickler:

* **Konfigurations-Suche:** Die authoritative Quelle für Umgebungsvariablen ist der Ordner `packages/@n8n/config/src/configs`. Suchen Sie nach dem Regex `@Env\('([^']+)`. Es existieren ca. 250 definierte Variablen.
* **Feature-Interdependenz:** Achtung bei der Analyse von "fehlenden" Features: Prüfen Sie immer drei Ebenen:
    1. **Config**: Ist es per ENV aktiviert? (`@n8n/config`)
    2. **Lizenz**: Erlaubt die Lizenz das Feature? (Suche nach `LicenseManager.hasFeatureEnabled` in `packages/cli`)
    3. **Build**: Wurde der Code dafür überhaupt generiert? (Prüfung von `scripts/*.mjs` Dateien, besonders für statische Assets wie API Specs)
