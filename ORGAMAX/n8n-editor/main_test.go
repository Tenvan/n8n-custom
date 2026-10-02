package main

import (
	"bufio"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"testing/fstest"
)

var testDist = fstest.MapFS{
	"index.html":    {Data: []byte(`<script nonce="{{CSP_NONCE}}" src="/assets/app.js"></script>`)},
	"assets/app.js": {Data: []byte(`console.log("app")`)},
	"favicon.ico":   {Data: []byte("ico")},
}

// backend antwortet mit dem Pfad, damit Tests Proxy von Static unterscheiden.
func newBackend(t *testing.T) *httptest.Server {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, "backend:"+r.URL.Path)
	}))
	t.Cleanup(srv.Close)
	return srv
}

func mustURL(t *testing.T, raw string) *url.URL {
	u, err := url.Parse(raw)
	if err != nil {
		t.Fatal(err)
	}
	return u
}

// noRedirect folgt keinen Weiterleitungen, damit Tests den Sprung auf die Landingpage sehen.
var noRedirect = &http.Client{CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}

// fetch sendet optional Header (z. B. Cookie, Sec-Fetch-Mode) und liefert die Antwort samt Body.
func fetch(t *testing.T, url string, header ...string) (*http.Response, string) {
	req, err := http.NewRequest(http.MethodGet, url, nil)
	if err != nil {
		t.Fatal(err)
	}
	for i := 0; i+1 < len(header); i += 2 {
		req.Header.Set(header[i], header[i+1])
	}
	resp, err := noRedirect.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	return resp, string(body)
}

func get(t *testing.T, url string, header ...string) (int, string) {
	resp, body := fetch(t, url, header...)
	return resp.StatusCode, body
}

const launchHeader = "Cookie"
const launchValue = launchCookie + "=1"

func TestRouting(t *testing.T) {
	backend := newBackend(t)
	proxy := httptest.NewServer(newHandler(testDist, mustURL(t, backend.URL)))
	defer proxy.Close()

	cases := []struct{ path, want string }{
		{"/rest/settings", "backend:/rest/settings"},
		{"/types/nodes.json", "backend:/types/nodes.json"},
		{"/icons/n8n-nodes-base/dist/x.svg", "backend:/icons/n8n-nodes-base/dist/x.svg"},
		{"/schemas/n/1.0.0.json", "backend:/schemas/n/1.0.0.json"},
		{"/healthz", "backend:/healthz"},
		{"/healthz/readiness", "backend:/healthz/readiness"},
		{"/webhook-test/abc", "backend:/webhook-test/abc"},
		{"/form-test/abc", "backend:/form-test/abc"},
		{"/assets/app.js", `console.log("app")`},
		{"/favicon.ico", "ico"},
		{"/", "<script nonce="},
		{"/workflow/42", "<script nonce="},
		{"/restaurant", "<script nonce="}, // kein Backend-Präfix, nur ähnlich
	}
	for _, c := range cases {
		status, body := get(t, proxy.URL+c.path, launchHeader, launchValue)
		if status != http.StatusOK || !strings.HasPrefix(body, c.want) {
			t.Errorf("%s: %d %q, erwartet Präfix %q", c.path, status, body, c.want)
		}
		if strings.Contains(body, "{{CSP_NONCE}}") {
			t.Errorf("%s: Nonce-Platzhalter nicht ersetzt", c.path)
		}
	}
	if status, _ := get(t, proxy.URL+"/assets/fehlt.js"); status != http.StatusNotFound {
		t.Errorf("fehlendes Asset: %d, erwartet 404", status)
	}
	resp, err := http.Post(proxy.URL+"/workflow/42", "text/plain", nil)
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusNotFound {
		t.Errorf("POST auf SPA-Pfad: %d, erwartet 404", resp.StatusCode)
	}
}

// TestLaunchGate: index.html nur mit Freigabe der Landingpage, die Freigabe gilt für einen Aufruf.
func TestLaunchGate(t *testing.T) {
	proxy := httptest.NewServer(newHandler(testDist, mustURL(t, newBackend(t).URL)))
	defer proxy.Close()

	resp, _ := fetch(t, proxy.URL+"/workflow/42?x=1")
	if want := launcherPath + "?next=%2Fworkflow%2F42%3Fx%3D1"; resp.StatusCode != http.StatusFound || resp.Header.Get("Location") != want {
		t.Errorf("ohne Freigabe: %d %q, erwartet 302 %q", resp.StatusCode, resp.Header.Get("Location"), want)
	}
	resp, body := fetch(t, proxy.URL+"/", launchHeader, launchValue)
	if resp.StatusCode != http.StatusOK || !strings.HasPrefix(body, "<script nonce=") {
		t.Errorf("mit Freigabe: %d %q", resp.StatusCode, body)
	}
	if c := resp.Cookies(); len(c) != 1 || c[0].Name != launchCookie || c[0].MaxAge >= 0 {
		t.Errorf("Freigabe nicht verbraucht: %v", c)
	}
	if status, body := get(t, proxy.URL+launcherPath); status != http.StatusOK || !strings.Contains(body, "n8n-Editor") {
		t.Errorf("Landingpage: %d", status)
	}
}

// TestLauncherStatus: Erfolg und Owner-Hinweis geben den Editor frei, Fehler nicht.
func TestLauncherStatus(t *testing.T) {
	version = "2.39.0"
	cases := []struct{ name, body, state string }{
		{"ok", `{"data":{"versionCli":"2.39.0"}}`, "ok"},
		{"ohne Owner", `{"data":{"settingsMode":"public"}}`, "warn"},
		{"Version", `{"data":{"versionCli":"2.40.0"}}`, "error"},
	}
	for _, c := range cases {
		proxy := httptest.NewServer(newHandler(testDist, mustURL(t, settingsServer(t, http.StatusOK, c.body).URL)))
		resp, body := fetch(t, proxy.URL+launcherPath+"status")
		proxy.Close()
		var st launchStatus
		if err := json.Unmarshal([]byte(body), &st); err != nil || st.State != c.state {
			t.Errorf("%s: %q, erwartet state %q", c.name, body, c.state)
		}
		if released := len(resp.Cookies()) == 1; released != (c.state != "error") {
			t.Errorf("%s: Freigabe-Cookie gesetzt=%v", c.name, released)
		}
	}
}

// TestProxyDown: Fällt n8n weg, landen Seitenaufrufe auf der Landingpage, XHR bekommt 502.
func TestProxyDown(t *testing.T) {
	gone := httptest.NewServer(http.NotFoundHandler())
	gone.Close()
	proxy := httptest.NewServer(newHandler(testDist, mustURL(t, gone.URL)))
	defer proxy.Close()

	if resp, _ := fetch(t, proxy.URL+"/rest/settings", "Sec-Fetch-Mode", "navigate"); resp.StatusCode != http.StatusFound ||
		!strings.HasPrefix(resp.Header.Get("Location"), launcherPath) {
		t.Errorf("Navigation: %d %q", resp.StatusCode, resp.Header.Get("Location"))
	}
	if status, _ := get(t, proxy.URL+"/rest/settings"); status != http.StatusBadGateway {
		t.Errorf("XHR: %d, erwartet 502", status)
	}
}

// TestWebSocketProxy prüft einen echten Upgrade über den Proxy samt umgeschriebenem Origin/Host.
func TestWebSocketProxy(t *testing.T) {
	var gotOrigin, gotHost string
	backend := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotOrigin, gotHost = r.Header.Get("Origin"), r.Host
		conn, rw, err := http.NewResponseController(w).Hijack()
		if err != nil {
			t.Error(err)
			return
		}
		defer conn.Close()
		rw.WriteString("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n")
		rw.Flush()
		line, _ := rw.ReadString('\n')
		rw.WriteString("echo:" + line)
		rw.Flush()
	}))
	defer backend.Close()
	target := mustURL(t, backend.URL)
	proxy := httptest.NewServer(newHandler(testDist, target))
	defer proxy.Close()

	conn, err := net.Dial("tcp", mustURL(t, proxy.URL).Host)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	fmt.Fprintf(conn, "GET /rest/push?pushRef=x HTTP/1.1\r\nHost: %s\r\nOrigin: %s\r\n"+
		"Connection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n\r\n",
		mustURL(t, proxy.URL).Host, proxy.URL)
	br := bufio.NewReader(conn)
	resp, err := http.ReadResponse(br, nil)
	if err != nil {
		t.Fatal(err)
	}
	if resp.StatusCode != http.StatusSwitchingProtocols {
		t.Fatalf("Status %d, erwartet 101", resp.StatusCode)
	}
	fmt.Fprint(conn, "ping\n")
	if line, _ := br.ReadString('\n'); line != "echo:ping\n" {
		t.Errorf("Echo %q", line)
	}
	if gotOrigin != backend.URL || gotHost != target.Host {
		t.Errorf("Backend sah Origin %q Host %q, erwartet %q / %q", gotOrigin, gotHost, backend.URL, target.Host)
	}
}

func settingsServer(t *testing.T, status int, body string) *httptest.Server {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/rest/settings" {
			http.NotFound(w, r)
			return
		}
		w.WriteHeader(status)
		fmt.Fprint(w, body)
	}))
	t.Cleanup(srv.Close)
	return srv
}

// TestStartAborts: Aufruffehler liefern einen Fehler; main zeigt ihn als Dialog vor dem Fenster.
func TestStartAborts(t *testing.T) {
	unreachable := httptest.NewServer(http.NotFoundHandler())
	unreachable.Close()
	noEnv := func(string) string { return "" }
	cases := []struct {
		name, target, want string
		dist               fstest.MapFS
	}{
		{"Ziel ungültig", "ftp://x", "ungültige Ziel-URL", testDist},
		{"Dist fehlt", unreachable.URL, "Editor-Dist fehlt", fstest.MapFS{}},
		{"Flag unbekannt", "--quatsch", "flag provided but not defined", testDist},
	}
	version = "2.39.0"
	for _, c := range cases {
		args := []string{"--target", c.target}
		if strings.HasPrefix(c.target, "--") {
			args = []string{c.target}
		}
		_, err := start(args, noEnv, c.dist)
		if err == nil || !strings.Contains(err.Error(), c.want) {
			t.Errorf("%s: %v, erwartet %q", c.name, err, c.want)
		}
	}
	if _, err := start([]string{"-h"}, noEnv, testDist); !errors.Is(err, flag.ErrHelp) || !strings.Contains(err.Error(), "-target") {
		t.Errorf("-h: %v", err)
	}
}

// TestCheckInstanceErrors: Die Fälle der Landingpage mit Überschrift und voller Meldung.
func TestCheckInstanceErrors(t *testing.T) {
	unreachable := httptest.NewServer(http.NotFoundHandler())
	unreachable.Close()
	cases := []struct{ name, url, title, want string }{
		{"nicht erreichbar", unreachable.URL, "n8n nicht erreichbar", "nicht erreichbar"},
		{"DISABLE_UI", settingsServer(t, http.StatusNotFound, "").URL, "Frontend-Backend fehlt", "N8N_DISABLE_UI=true"},
		{"Version", settingsServer(t, http.StatusOK, `{"data":{"versionCli":"2.40.0"}}`).URL, "Versionen passen nicht", "erwartet 2.39.0, gefunden 2.40.0"},
	}
	for _, c := range cases {
		err := checkInstance(http.DefaultClient, mustURL(t, c.url), "2.39.0")
		var ce checkError
		if !errors.As(err, &ce) || ce.Title != c.title || !strings.Contains(err.Error(), c.want) {
			t.Errorf("%s: %v, erwartet %q / %q", c.name, err, c.title, c.want)
		}
	}
}

func TestCheckInstanceOK(t *testing.T) {
	srv := settingsServer(t, http.StatusOK, `{"data":{"versionCli":"2.39.0"}}`)
	if err := checkInstance(http.DefaultClient, mustURL(t, srv.URL), "2.39.0"); err != nil {
		t.Fatal(err)
	}
	// Ohne Owner: kein Abbruch, run gibt nur einen Hinweis aus und startet für das Owner-Setup.
	for _, body := range []string{`{"data":{"settingsMode":"public"}}`, `{"data":{}}`} {
		srv := settingsServer(t, http.StatusOK, body)
		if err := checkInstance(http.DefaultClient, mustURL(t, srv.URL), "2.39.0"); !errors.Is(err, errVersionUnknown) {
			t.Errorf("%s: %v, erwartet errVersionUnknown", body, err)
		}
	}
}

func TestResolveTarget(t *testing.T) {
	env := func(v string) func(string) string { return func(string) string { return v } }
	cases := []struct{ flag, env, want string }{
		{"http://127.0.0.1:5500", "http://x:1", "http://127.0.0.1:5500"},
		{"", "http://127.0.0.1:5600/", "http://127.0.0.1:5600"},
		{"", "", defaultTarget},
	}
	for _, c := range cases {
		u, err := resolveTarget(c.flag, env(c.env))
		if err != nil || u.String() != c.want {
			t.Errorf("flag=%q env=%q: %v %v, erwartet %s", c.flag, c.env, u, err, c.want)
		}
	}
	for _, bad := range []string{"127.0.0.1:5678", "ftp://x", "http://"} {
		if _, err := resolveTarget(bad, env("")); err == nil {
			t.Errorf("%q: Fehler erwartet", bad)
		}
	}
}

func TestListenLoopbackOnly(t *testing.T) {
	ln, err := listen()
	if err != nil {
		t.Fatal(err)
	}
	defer ln.Close()
	addr := ln.Addr().(*net.TCPAddr)
	if !addr.IP.Equal(net.IPv4(127, 0, 0, 1)) || addr.Port == 0 {
		t.Errorf("gebunden an %s, erwartet 127.0.0.1:<frei>", addr)
	}
}
