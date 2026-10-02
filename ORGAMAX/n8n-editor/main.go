// n8n-editor zeigt den originalen n8n-Editor in einem eigenen Wails-Fenster gegen eine lokale
// n8n-Instanz. Die Editor-Dist ist eingebettet, Backend-Pfade gehen per Reverse-Proxy an die Instanz.
// Internes Werkzeug für orgaMAX-Mitarbeiter, nie Teil der Auslieferung.
package main

import (
	"cmp"
	"embed"
	"errors"
	"flag"
	"fmt"
	"io/fs"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"
)

// Befüllt von `task deploy:n8n-editor`. Ohne Build liegt dort nur .gitkeep, dann bricht start mit Hinweis ab.
//
//go:embed all:editor-dist
var embedded embed.FS

// version ist die n8n-Version der eingebetteten Dist, gesetzt per -ldflags "-X main.version=…".
var version = "unbekannt"

const defaultTarget = "http://127.0.0.1:5678"

// main hat kein Konsolenfenster (-H windowsgui). Fehler beim Aufruf (Flags, Ziel-URL, fehlende Dist)
// gehen als nativer Dialog raus, mit Exit-Code ≠ 0. Den Zustand der Instanz prüft die Landingpage
// im Fenster und zeigt Fehler dort an.
func main() {
	setDPIAware()
	dist, _ := fs.Sub(embedded, "editor-dist")
	target, err := start(os.Args[1:], os.Getenv, dist)
	switch {
	case errors.Is(err, flag.ErrHelp):
		infoBox(err.Error())
		return
	case err != nil:
		errorBox(err.Error())
		os.Exit(1)
	}

	ln, err := listen()
	if err != nil {
		errorBox("Lokaler Port nicht verfügbar: " + err.Error())
		os.Exit(1)
	}
	srv := &http.Server{Handler: newHandler(dist, target), ReadHeaderTimeout: 10 * time.Second}
	go srv.Serve(ln)

	// Schließen des Fensters beendet wails.Run und damit EXE und Proxy.
	title := fmt.Sprintf("n8n-Editor %s – %s", version, target)
	if err := showWindow(title, "http://"+ln.Addr().String()+launcherPath); err != nil {
		errorBox("Editor-Fenster nicht gestartet: " + err.Error())
		os.Exit(1)
	}
}

// usageError trägt den Hilfetext von flag, weil es keine Konsole gibt, auf die flag schreiben könnte.
type usageError struct {
	err  error
	text string
}

func (e usageError) Error() string { return strings.TrimSpace(e.text) }
func (e usageError) Unwrap() error { return e.err }

// start prüft Aufruf und Dist und liefert das Ziel. Die Instanz prüft danach die Landingpage.
func start(args []string, getenv func(string) string, dist fs.FS) (*url.URL, error) {
	flags := flag.NewFlagSet("n8n-editor", flag.ContinueOnError)
	var usage strings.Builder
	flags.SetOutput(&usage)
	target := flags.String("target", "", "URL der n8n-Instanz (sonst N8N_BASE_URL, sonst "+defaultTarget+")")
	if err := flags.Parse(args); err != nil {
		return nil, usageError{err, usage.String()}
	}
	if _, err := fs.Stat(dist, "index.html"); err != nil {
		return nil, errors.New("Editor-Dist fehlt in der EXE – mit `task deploy:n8n-editor` bauen.")
	}
	return resolveTarget(*target, getenv)
}

// resolveTarget: --target, sonst N8N_BASE_URL, sonst Default.
func resolveTarget(flagValue string, getenv func(string) string) (*url.URL, error) {
	raw := cmp.Or(flagValue, getenv("N8N_BASE_URL"), defaultTarget)
	u, err := url.Parse(strings.TrimRight(raw, "/"))
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" {
		return nil, fmt.Errorf("ungültige Ziel-URL %q, erwartet http(s)://host:port", raw)
	}
	return u, nil
}
