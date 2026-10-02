// winres schreibt das App-Icon als Windows-Ressource in eine .syso-Datei, die `go build` im
// Paketverzeichnis automatisch einbindet. Ersatz für den Ressourcenschritt von `wails build`, das
// dieses Tool nicht nutzt (pkg/commands/build/packager.go, compileResources). Die Icon-ID
// entspricht der von Wails (winc.AppIconID = 3), damit Fenster- und Taskleisten-Icon dasselbe
// Icon laden wie der Explorer. Die .syso ist ein Build-Artefakt (.gitignore: **/*.syso).
// Aufruf: go run ./cmd/winres <icon.ico> <ziel.syso>
package main

import (
	"fmt"
	"os"
	"runtime"

	"github.com/tc-hib/winres"
)

var archs = map[string]winres.Arch{
	"amd64": winres.ArchAMD64,
	"arm64": winres.ArchARM64,
	"386":   winres.ArchI386,
}

func main() {
	if len(os.Args) != 3 {
		fmt.Fprintln(os.Stderr, "Aufruf: winres <icon.ico> <ziel.syso>")
		os.Exit(2)
	}
	if err := writeSyso(os.Args[1], os.Args[2], runtime.GOARCH); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func writeSyso(iconPath, target, goarch string) error {
	arch, ok := archs[goarch]
	if !ok {
		return fmt.Errorf("Architektur %q nicht unterstützt", goarch)
	}
	in, err := os.Open(iconPath)
	if err != nil {
		return err
	}
	defer in.Close()
	ico, err := winres.LoadICO(in)
	if err != nil {
		return fmt.Errorf("%s ist kein gültiges .ico: %w", iconPath, err)
	}
	var rs winres.ResourceSet
	if err := rs.SetIcon(winres.RT_ICON, ico); err != nil {
		return err
	}
	out, err := os.Create(target)
	if err != nil {
		return err
	}
	if err := rs.WriteObject(out, arch); err != nil {
		out.Close()
		return err
	}
	return out.Close()
}
