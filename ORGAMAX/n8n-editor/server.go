package main

import (
	"bytes"
	"crypto/rand"
	"io/fs"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"path"
	"strings"
)

// backendPrefixes gehen an die Instanz, alles andere ist Editor-Dist oder SPA-Fallback.
// /schemas liefert n8n nur mit Frontend aus (server.js:308), deshalb zusätzlich zur Spec-Liste.
// /healthz pollt der Editor same-origin als Online-Anzeige (settings.endpointHealth).
var backendPrefixes = []string{"/rest", "/types", "/icons", "/schemas", "/healthz", "/webhook-test", "/form-test"}

// Platzhalter in index.html, den n8n je Antwort durch einen Nonce ersetzt (server.js:345).
var noncePlaceholder = []byte("{{CSP_NONCE}}")

// listen bindet ausschließlich an Loopback, der Port ist frei gewählt.
func listen() (net.Listener, error) {
	return net.Listen("tcp", "127.0.0.1:0")
}

func newHandler(dist fs.FS, target *url.URL) http.Handler {
	proxy := newProxy(target)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, launcherPath) {
			serveLauncher(w, r, target)
			return
		}
		if isBackend(r.URL.Path) {
			proxy.ServeHTTP(w, r)
			return
		}
		serveStatic(w, r, dist)
	})
}

func isBackend(p string) bool {
	for _, prefix := range backendPrefixes {
		if p == prefix || strings.HasPrefix(p, prefix+"/") {
			return true
		}
	}
	return false
}

// newProxy leitet inkl. WebSocket-Upgrade (/rest/push) weiter. Rewrite entfernt X-Forwarded-*,
// SetURL setzt Host auf das Ziel. Der Push-Kanal vergleicht Origin mit Host
// (push/origin-validator.js), deshalb zeigt auch Origin auf das Ziel.
// Ist n8n weg, landet eine Seitennavigation auf der Landingpage; XHR/fetch bekommen 502, damit der
// Editor sein eigenes „Offline“ zeigt und ungespeicherte Änderungen behält.
func newProxy(target *url.URL) *httputil.ReverseProxy {
	origin := target.Scheme + "://" + target.Host
	return &httputil.ReverseProxy{
		Rewrite: func(r *httputil.ProxyRequest) {
			r.SetURL(target)
			if r.In.Header.Get("Origin") != "" {
				r.Out.Header.Set("Origin", origin)
			}
		},
		ErrorHandler: func(w http.ResponseWriter, r *http.Request, _ error) {
			if isNavigation(r) {
				toLauncher(w, r)
				return
			}
			w.WriteHeader(http.StatusBadGateway)
		},
	}
}

// serveStatic liefert Dateien der Dist, unbekannte Nicht-Asset-Pfade bekommen index.html (Vue-Router).
// index.html gibt es nur mit Freigabe der Landingpage, sonst geht es dorthin (Start, Reload, Deep-Link).
func serveStatic(w http.ResponseWriter, r *http.Request, dist fs.FS) {
	name := strings.TrimPrefix(path.Clean("/"+r.URL.Path), "/")
	if info, err := fs.Stat(dist, name); err == nil && !info.IsDir() && name != "index.html" {
		if strings.HasPrefix(name, "assets/") {
			w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
		}
		http.ServeFileFS(w, r, dist, name)
		return
	}
	// Wie n8n (historyApiHandler/nonUIRoutes in server.js): Fallback nur für GET/HEAD,
	// fehlende Assets sind 404.
	if (r.Method != http.MethodGet && r.Method != http.MethodHead) ||
		strings.HasPrefix(name, "assets/") || strings.HasPrefix(name, "static/") {
		http.NotFound(w, r)
		return
	}
	if !consumeLaunch(w, r) {
		toLauncher(w, r)
		return
	}
	serveIndex(w, dist)
}

// serveIndex setzt je Antwort einen frischen Nonce. Einen CSP-Header sendet der Proxy nicht,
// n8n tut das ohne N8N_CONTENT_SECURITY_POLICY ebenfalls nicht.
func serveIndex(w http.ResponseWriter, dist fs.FS) {
	data, err := fs.ReadFile(dist, "index.html")
	if err != nil {
		http.Error(w, "index.html fehlt", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
	_, _ = w.Write(bytes.ReplaceAll(data, noncePlaceholder, []byte(rand.Text())))
}
