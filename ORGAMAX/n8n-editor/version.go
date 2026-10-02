package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
)

// errVersionUnknown: Ohne Owner liefert n8n unangemeldet nur die public Settings ohne versionCli
// (auth/auth.service.js:97-100 nimmt sonst den Instance-Owner, server.js:402-405,
// frontend.service.js:521). Der Editor muss dann trotzdem starten, sonst gibt es keinen Weg
// zum Owner-Setup (auf 5678 liegt kein Editor).
var errVersionUnknown = errors.New("Version nicht prüfbar: Die Instanz hat noch keinen Owner eingerichtet. Der Editor startet trotzdem für das Owner-Setup.")

// checkError trägt Überschrift und Hinweis für die Landingpage, Error() bleibt die volle Meldung.
type checkError struct {
	Title, Hint string
	err         error
}

func (e checkError) Error() string { return e.err.Error() }
func (e checkError) Unwrap() error { return e.err }

// checkInstance prüft Erreichbarkeit, Frontend-Backend und Version über /rest/settings.
func checkInstance(client *http.Client, target *url.URL, want string) error {
	settingsURL := target.JoinPath("rest", "settings").String()
	resp, err := client.Get(settingsURL)
	if err != nil {
		return checkError{"n8n nicht erreichbar", "Läuft der n8n-Dienst der lokalen ErpApi (pm2)? Die Seite prüft automatisch erneut.",
			fmt.Errorf("n8n unter %s nicht erreichbar: %w", target, err)}
	}
	defer resp.Body.Close()
	switch {
	case resp.StatusCode == http.StatusNotFound:
		return checkError{"Frontend-Backend fehlt", "In der ecosystem.config.js N8N_DISABLE_UI=false setzen und n8n neu starten.",
			fmt.Errorf("%s fehlt (404): Die Instanz läuft vermutlich mit N8N_DISABLE_UI=true und hat kein Frontend-Backend. N8N_DISABLE_UI=false setzen und n8n neu starten", settingsURL)}
	case resp.StatusCode != http.StatusOK:
		return checkError{"Unerwartete Antwort von n8n", "", fmt.Errorf("%s antwortet mit %s", settingsURL, resp.Status)}
	}
	var body struct {
		Data struct {
			VersionCli string `json:"versionCli"`
		} `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		return checkError{"Unerwartete Antwort von n8n", "", fmt.Errorf("%s: Antwort nicht lesbar: %w", settingsURL, err)}
	}
	switch got := body.Data.VersionCli; {
	case got == "": // settingsMode "public"
		return errVersionUnknown
	case got != want:
		return checkError{"Versionen passen nicht", "Pro n8n-Version gibt es eine eigene n8n-editor.exe. Die passende EXE verwenden.",
			fmt.Errorf("n8n-Version passt nicht zum eingebetteten Editor: erwartet %s, gefunden %s", want, got)}
	}
	return nil
}
