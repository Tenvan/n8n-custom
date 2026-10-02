package main

import (
	_ "embed"
	"encoding/json"
	"errors"
	"net/http"
	"net/url"
	"time"
)

// Die Landingpage ist der Einstieg jedes Fensterstarts und Reloads: Sie prüft die Instanz, zeigt
// Fehler an und leitet erst danach in den Editor. Der Pfad kollidiert mit keiner n8n-Route.
const launcherPath = "/__launcher/"

// launchCookie gibt genau einen Aufruf von index.html frei. Er wird dabei verbraucht, damit jeder
// spätere Reload wieder über die Landingpage läuft.
const launchCookie = "n8n-editor-launch"

//go:embed launcher.html
var launcherPage []byte

type launchStatus struct {
	State   string `json:"state"` // ok | warn | error
	Title   string `json:"title"`
	Hint    string `json:"hint,omitempty"`
	Detail  string `json:"detail,omitempty"`
	Target  string `json:"target"`
	Version string `json:"version"`
}

func serveLauncher(w http.ResponseWriter, r *http.Request, target *url.URL) {
	w.Header().Set("Cache-Control", "no-store")
	switch r.URL.Path {
	case launcherPath:
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write(launcherPage)
	case launcherPath + "status":
		writeStatus(w, target)
	default:
		http.NotFound(w, r)
	}
}

func writeStatus(w http.ResponseWriter, target *url.URL) {
	st := launchStatus{State: "ok", Title: "Verbunden, Editor wird geöffnet …", Target: target.String(), Version: version}
	err := checkInstance(&http.Client{Timeout: 5 * time.Second}, target, version)
	var ce checkError
	switch {
	case errors.Is(err, errVersionUnknown):
		st.State, st.Title, st.Hint = "warn", "Owner noch nicht eingerichtet", err.Error()
	case errors.As(err, &ce):
		st.State, st.Title, st.Hint, st.Detail = "error", ce.Title, ce.Hint, ce.Error()
	case err != nil:
		st.State, st.Title, st.Detail = "error", "Prüfung fehlgeschlagen", err.Error()
	}
	if st.State != "error" {
		http.SetCookie(w, &http.Cookie{Name: launchCookie, Value: "1", Path: "/", MaxAge: 60, HttpOnly: true, SameSite: http.SameSiteStrictMode})
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(st)
}

// toLauncher schickt eine Seitennavigation auf die Landingpage und merkt sich das Ziel.
func toLauncher(w http.ResponseWriter, r *http.Request) {
	http.Redirect(w, r, launcherPath+"?next="+url.QueryEscape(r.URL.RequestURI()), http.StatusFound)
}

// consumeLaunch prüft den Freigabe-Cookie und löscht ihn.
func consumeLaunch(w http.ResponseWriter, r *http.Request) bool {
	if _, err := r.Cookie(launchCookie); err != nil {
		return false
	}
	http.SetCookie(w, &http.Cookie{Name: launchCookie, Path: "/", MaxAge: -1})
	return true
}

// isNavigation: Seitenaufruf des Fensters, keine XHR/fetch des Editors.
func isNavigation(r *http.Request) bool {
	return r.Header.Get("Sec-Fetch-Mode") == "navigate"
}
