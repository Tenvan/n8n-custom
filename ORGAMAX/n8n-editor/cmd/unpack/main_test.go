package main

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func writeTgz(t *testing.T, path string, files map[string]string) {
	var buf bytes.Buffer
	gz := gzip.NewWriter(&buf)
	tw := tar.NewWriter(gz)
	for name, body := range files {
		tw.WriteHeader(&tar.Header{Name: name, Mode: 0o644, Size: int64(len(body)), Typeflag: tar.TypeReg})
		tw.Write([]byte(body))
	}
	tw.Close()
	gz.Close()
	if err := os.WriteFile(path, buf.Bytes(), 0o644); err != nil {
		t.Fatal(err)
	}
}

func TestUnpackRejectsTraversal(t *testing.T) {
	dir := t.TempDir()
	tgz := filepath.Join(dir, "evil.tgz")
	writeTgz(t, tgz, map[string]string{"package/dist/../../x": "böse"})
	dest := filepath.Join(dir, "a", "b")
	if _, err := unpack(tgz, dest); err == nil || !strings.Contains(err.Error(), "unzulässiger Pfad") {
		t.Errorf("Fehler erwartet, bekam %v", err)
	}
	if _, err := os.Stat(filepath.Join(dir, "x")); !os.IsNotExist(err) {
		t.Error("Datei außerhalb des Ziels geschrieben")
	}
}

func TestUnpack(t *testing.T) {
	files := map[string]string{
		"package/package.json":        `{"version":"2.39.0"}`,
		"package/dist/index.html":     `<link href="/{{BASE_PATH}}/favicon.ico">%CONFIG_TAGS%<b nonce="{{CSP_NONCE}}">{{REST_ENDPOINT}}`,
		"package/dist/static/base.js": `window.BASE_PATH = '/{{BASE_PATH}}/';u="/%7B%7BBASE_PATH%7D%7D/x"`,
		"package/dist/logo.svg":       `/{{BASE_PATH}}/`,
	}
	dir := t.TempDir()
	tgz := filepath.Join(dir, "editor.tgz")
	writeTgz(t, tgz, files)
	dest := filepath.Join(dir, "editor-dist")
	os.MkdirAll(dest, 0o755)
	os.WriteFile(filepath.Join(dest, ".gitkeep"), nil, 0o644)
	os.WriteFile(filepath.Join(dest, "alt.js"), nil, 0o644)

	n, err := unpack(tgz, dest)
	if err != nil || n != 3 {
		t.Fatalf("n=%d err=%v", n, err)
	}
	read := func(name string) string {
		b, err := os.ReadFile(filepath.Join(dest, name))
		if err != nil {
			t.Fatal(err)
		}
		return string(b)
	}
	if got := read("index.html"); got != `<link href="/favicon.ico"><meta name="n8n:config:rest-endpoint" content="cmVzdA=="><b nonce="{{CSP_NONCE}}">rest` {
		t.Errorf("index.html: %s", got)
	}
	if got := read("static/base.js"); got != `window.BASE_PATH = '/';u="/x"` {
		t.Errorf("base.js: %s", got)
	}
	if got := read("logo.svg"); !strings.Contains(got, "{{BASE_PATH}}") {
		t.Errorf("svg darf nicht ersetzt werden: %s", got)
	}
	if _, err := os.Stat(filepath.Join(dest, "alt.js")); !os.IsNotExist(err) {
		t.Error("alte Dist-Datei nicht entfernt")
	}
	if _, err := os.Stat(filepath.Join(dest, ".gitkeep")); err != nil {
		t.Error(".gitkeep entfernt")
	}
}
