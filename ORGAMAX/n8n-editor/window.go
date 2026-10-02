package main

import (
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	wailswin "github.com/wailsapp/wails/v2/pkg/options/windows"
	"golang.org/x/sys/windows"
)

// showWindow öffnet das Wails-Fenster und blockiert, bis es geschlossen wird.
//
// Der Editor läuft nicht über den Wails-AssetServer: Den bedient WebView2 über
// WebResourceRequested, dessen ResponseWriter kein Hijack kennt
// (pkg/assetserver/webview/responsewriter_windows.go), der Push-Kanal /rest/push braucht aber
// einen WebSocket. Die Startseite leitet deshalb sofort auf den Loopback-Proxy um, fremde Hosts
// reicht Wails an den normalen WebView2-Netzwerkweg durch (internal/frontend/desktop/windows/frontend.go:652-658).
func showWindow(title, proxyURL string) error {
	cacheDir, err := os.UserCacheDir() // %LOCALAPPDATA%
	if err != nil {
		return err
	}
	page := `<!doctype html><meta charset="utf-8"><script>location.replace(` + strconv.Quote(proxyURL) + `)</script>`
	return wails.Run(&options.App{
		Title:            title,
		Width:            1400,
		Height:           900,
		WindowStartState: options.Maximised,
		AssetServer: &assetserver.Options{Handler: http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			_, _ = io.WriteString(w, page)
		})},
		// Fester Profilordner, damit das n8n-Login (Cookie) den Neustart überlebt.
		Windows: &wailswin.Options{WebviewUserDataPath: filepath.Join(cacheDir, "orgaMAX", "n8n-editor", "WebView2")},
	})
}

// setDPIAware: Ohne Wails-Manifest wäre der Prozess DPI-unaware und das Fenster auf skalierten
// Bildschirmen unscharf.
func setDPIAware() {
	_, _, _ = windows.NewLazySystemDLL("user32.dll").NewProc("SetProcessDPIAware").Call()
}

func errorBox(text string) { messageBox(text, windows.MB_ICONERROR) }
func infoBox(text string)  { messageBox(text, windows.MB_ICONINFORMATION) }

func messageBox(text string, icon uint32) {
	body, _ := windows.UTF16PtrFromString(text)
	caption, _ := windows.UTF16PtrFromString("n8n-Editor")
	_, _ = windows.MessageBox(0, body, caption, windows.MB_OK|windows.MB_SETFOREGROUND|icon)
}
