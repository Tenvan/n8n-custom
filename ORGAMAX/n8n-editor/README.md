# n8n-editor

Internes Werkzeug, ausschließlich für orgaMAX-Mitarbeiter. Zeigt den originalen n8n-Editor in
einem eigenen Wails-Fenster (WebView2) gegen eine lokal installierte ErpApi-n8n-Instanz, obwohl die Auslieferung selbst keinen Editor
mehr enthält (Grundregel [„n8n beim Kunden“](im ErpApi-Repo: `docs/standards/architecture.md`)).
Nie an Kunden ausgeben.

## Start

```text
n8n-editor.exe [--target URL]
```

- Prüft zuerst, ob die Editor-Dist eingebettet ist.
- Löst die Ziel-URL auf (`--target`, sonst `N8N_BASE_URL`, sonst `http://127.0.0.1:5678`).
- Startet einen lokalen HTTP-Server ausschließlich auf `127.0.0.1` (freier Port) und öffnet ein
  Wails-Fenster mit Titel `n8n-Editor <Version> – <Ziel>`. Kein Browser, kein Konsolenfenster.
  Schließen des Fensters beendet EXE und Proxy.
- Das Fenster startet auf der Landingpage `/__launcher/`. Sie prüft die Instanz über
  `GET /rest/settings` (Erreichbarkeit, Frontend-Backend, Version) und leitet bei Erfolg in den
  Editor weiter. Fehler zeigt sie mit Hinweis und Details an und prüft alle 5 s erneut.
- Das WebView2-Profil liegt fest unter `%LOCALAPPDATA%\orgaMAX\n8n-editor\WebView2`, damit das
  n8n-Login den Neustart überlebt.

Das Fenster lädt die Proxy-URL, statt über den Wails-AssetServer zu laufen: Den bedient WebView2
über `WebResourceRequested`, dessen ResponseWriter kein Hijack kennt, der Push-Kanal `/rest/push`
braucht aber einen WebSocket. Die Wails-Startseite leitet deshalb per `location.replace` auf den
Proxy um.

Backend-Pfade (`/rest` inkl. WebSocket `/rest/push`, `/types`, `/icons`, `/schemas`, `/healthz`,
`/webhook-test`, `/form-test`) gehen per Reverse-Proxy an die Ziel-Instanz, alles andere liefert
die eingebettete Editor-Dist. Unbekannte Pfade bekommen bei GET/HEAD `index.html` (SPA-Fallback,
frischer CSP-Nonce je Antwort), andere Methoden und fehlende `/assets`/`/static`-Dateien 404.

## Landingpage als Fallback

`index.html` gibt es nur mit einer Freigabe der Landingpage: Nach erfolgreicher Prüfung setzt
`/__launcher/status` das Cookie `n8n-editor-launch`, der nächste Aufruf von `index.html` verbraucht
es. Jeder Fensterstart, Reload und direkte Aufruf eines Editor-Pfads läuft deshalb über die
Landingpage und kehrt danach auf denselben Pfad zurück (`?next=`).

Fällt n8n während der Arbeit weg, bekommen Seitenaufrufe (`Sec-Fetch-Mode: navigate`) eine
Weiterleitung auf die Landingpage, XHR/fetch des Editors ein 502. Ein offener Editor wird bewusst
nicht umgeleitet: Er zeigt sein eigenes „Offline“ und behält ungespeicherte Änderungen.

## Versionskopplung

Eine EXE ist an genau eine n8n-Version gebunden. Die eingebettete Editor-Dist stammt aus
`packages/<version>/n8n-editor-ui-<version>.tgz`, derselben Quelle wie die ausgelieferte
n8n-Version. Weicht `versionCli` der Ziel-Instanz von der eingebetteten Version ab, bleibt die
Landingpage mit „Versionen passen nicht“ stehen.

Hat die Instanz noch keinen Owner, liefert `/rest/settings` nur die public Settings ohne
`versionCli`. Dann warnt die Landingpage („Owner noch nicht eingerichtet“) und öffnet den Editor
nach 5 s trotzdem, weil das
Owner-Setup sonst nirgends möglich ist (auf Port 5678 liegt kein Editor).

## Build

Der Quelltext liegt in diesem Fork (`ORGAMAX/n8n-editor`), gebaut wird mit dem Editor-UI des Forks:

```text
task orgamax:pack          # erzeugt .deploy/n8n-editor-ui-<version>.tgz
task orgamax:n8n-editor    # -> ORGAMAX/n8n-editor/dist/n8n-editor.exe
```

`orgamax:n8n-editor` entpackt den einzigen `n8n-editor-ui-<version>.tgz` aus `.deploy/` nach
`editor-dist/`, schreibt das App-Icon als `.syso` und baut ohne Wails-CLI per `go build` mit
`-tags desktop,production -ldflags -H windowsgui`. Die Version der EXE ist die des Tarballs. Liegt
mehr als ein Editor-Tarball in `.deploy/`, bricht der Task ab. Die EXE ist nicht Teil von Installer
oder Server-Archiven.

Icon-Quelle ist `build/windows/icon.ico` (aus `design-system/brand/tool-icons/n8n-editor.svg` im ErpApi-Repo).

## Fehlermeldungen

Auf der Landingpage (Überschrift, Hinweis, volle Meldung):

| Überschrift | Meldung |
|---|---|
| n8n nicht erreichbar | `n8n unter %s nicht erreichbar: %w` |
| Frontend-Backend fehlt | `%s fehlt (404): Die Instanz läuft vermutlich mit N8N_DISABLE_UI=true …` |
| Unerwartete Antwort von n8n | `%s antwortet mit %s` |
| Versionen passen nicht | `n8n-Version passt nicht zum eingebetteten Editor: erwartet %s, gefunden %s` |
| Owner noch nicht eingerichtet (Warnung) | Editor öffnet nach 5 s trotzdem, siehe Versionskopplung |

Als nativer Dialog vor dem Fenster, danach Exit-Code ≠ 0:

- `Editor-Dist fehlt in der EXE – mit \`task deploy:n8n-editor\` bauen.`
- `ungültige Ziel-URL %q, erwartet http(s)://host:port`
- `Lokaler Port nicht verfügbar: %v`

`-h` zeigt die Hilfe als Dialog.

## Bekannte Grenzen

- OAuth2-Credential-Callbacks und Webhook-Test-URLs zeigen auf `N8N_EDITOR_BASE_URL`/`WEBHOOK_URL`
  der Instanz, nicht auf die Proxy-URL.
- Das `n8n-auth`-Cookie ist `Secure`. WebView2 akzeptiert das auf `127.0.0.1` (sicherer Kontext).
- Ohne Wails-Manifest setzt die EXE DPI-Awareness per `SetProcessDPIAware` (System-DPI); auf
  Monitoren mit abweichender Skalierung kann das Fenster unscharf wirken.
- Der Chat-Trigger-WebSocket (`/chat`) läuft nicht über den Proxy.
