// unpack entpackt package/dist aus n8n-editor-ui-<version>.tgz ins Embed-Verzeichnis und
// wendet dabei die Ersetzungen an, die `n8n start` beim Start macht (commands/start.js:114-150),
// fest für BASE_PATH "/" und REST-Endpunkt "rest". Der CSP-Nonce bleibt Platzhalter, den setzt
// die EXE je Antwort. Aufruf: go run ./cmd/unpack <tgz> <zielverzeichnis>
package main

import (
	"archive/tar"
	"compress/gzip"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"os"
	"path"
	"path/filepath"
	"strings"
)

const distPrefix = "package/dist/"

func main() {
	if len(os.Args) != 3 {
		fmt.Fprintln(os.Stderr, "Aufruf: unpack <n8n-editor-ui.tgz> <zielverzeichnis>")
		os.Exit(2)
	}
	n, err := unpack(os.Args[1], os.Args[2])
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	fmt.Printf("%d Dateien nach %s entpackt\n", n, os.Args[2])
}

func unpack(tgz, dest string) (int, error) {
	if err := clearDir(dest); err != nil {
		return 0, err
	}
	f, err := os.Open(tgz)
	if err != nil {
		return 0, err
	}
	defer f.Close()
	gz, err := gzip.NewReader(f)
	if err != nil {
		return 0, fmt.Errorf("%s: %w", tgz, err)
	}
	tr := tar.NewReader(gz)
	count := 0
	for {
		h, err := tr.Next()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			return count, fmt.Errorf("%s: %w", tgz, err)
		}
		name, ok := strings.CutPrefix(h.Name, distPrefix)
		if !ok || h.Typeflag != tar.TypeReg {
			continue
		}
		if err := writeFile(dest, name, tr); err != nil {
			return count, err
		}
		count++
	}
	if count == 0 {
		return 0, fmt.Errorf("%s enthält kein %s", tgz, distPrefix)
	}
	return count, nil
}

// clearDir leert das Embed-Verzeichnis bis auf das versionierte .gitkeep.
func clearDir(dest string) error {
	entries, err := os.ReadDir(dest)
	if err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}
	for _, e := range entries {
		if e.Name() == ".gitkeep" {
			continue
		}
		if err := os.RemoveAll(filepath.Join(dest, e.Name())); err != nil {
			return err
		}
	}
	return nil
}

func writeFile(dest, name string, r io.Reader) error {
	if !filepath.IsLocal(name) {
		return fmt.Errorf("unzulässiger Pfad im Archiv: %s", name)
	}
	data, err := io.ReadAll(r)
	if err != nil {
		return err
	}
	data = rewrite(name, data)
	target := filepath.Join(dest, filepath.FromSlash(name))
	if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
		return err
	}
	return os.WriteFile(target, data, 0o644)
}

// rewrite spiegelt compileFile aus commands/start.js: index.html, *.js und *.css.
func rewrite(name string, data []byte) []byte {
	ext := path.Ext(name)
	if name != "index.html" && ext != ".js" && ext != ".css" {
		return data
	}
	configTags := `<meta name="n8n:config:rest-endpoint" content="` + base64.StdEncoding.EncodeToString([]byte("rest")) + `">`
	pairs := []string{
		"%CONFIG_TAGS%", configTags,
		"/{{BASE_PATH}}/", "/",
		"/%7B%7BBASE_PATH%7D%7D/", "/",
		"/%257B%257BBASE_PATH%257D%257D/", "/",
	}
	if name == "index.html" {
		pairs = append(pairs, "{{REST_ENDPOINT}}", "rest")
	}
	return []byte(strings.NewReplacer(pairs...).Replace(string(data)))
}
