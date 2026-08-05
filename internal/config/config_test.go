package config

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/gr1m0h/ichiza/internal/event"
)

func TestLoadMissingFileFallsBack(t *testing.T) {
	c, err := Load(filepath.Join(t.TempDir(), "no-such.yaml"))
	if err != nil {
		t.Fatal(err)
	}
	want := Fallback()
	if c.EventsDir != want.EventsDir || c.Defaults.Mode != want.Defaults.Mode {
		t.Errorf("Load(missing) = %+v, want fallback %+v", c, want)
	}
}

func TestLoadOverridesFallback(t *testing.T) {
	path := filepath.Join(t.TempDir(), "ichiza.yaml")
	src := `defaults:
  mode: hybrid
  venue:
    capacity: 30
  roles: [mc, reception]
notifier:
  type: discord
registry:
  templates:
    page: templates/registry/page.md
`
	if err := os.WriteFile(path, []byte(src), 0o644); err != nil {
		t.Fatal(err)
	}
	c, err := Load(path)
	if err != nil {
		t.Fatal(err)
	}
	if c.Defaults.Mode != event.ModeHybrid {
		t.Errorf("mode = %q", c.Defaults.Mode)
	}
	if c.Defaults.Venue.Capacity != 30 {
		t.Errorf("capacity = %d", c.Defaults.Venue.Capacity)
	}
	if c.Notifier.Type != "discord" {
		t.Errorf("notifier = %q", c.Notifier.Type)
	}
	if c.Registry.Templates.Page != "templates/registry/page.md" {
		t.Errorf("registry page template = %q", c.Registry.Templates.Page)
	}
	if c.Registry.Templates.Speaker != "" {
		t.Errorf("registry speaker template = %q, want empty (built-in)", c.Registry.Templates.Speaker)
	}
	// Unspecified keys keep their fallback values
	if c.EventsDir != "events" || c.Lifecycle != "templates/lifecycle.yaml" {
		t.Errorf("unspecified keys lost fallback: %+v", c)
	}
}

func TestLoadBrokenYAML(t *testing.T) {
	path := filepath.Join(t.TempDir(), "ichiza.yaml")
	if err := os.WriteFile(path, []byte("defaults: ["), 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := Load(path); err == nil {
		t.Error("Load(broken) = nil error, want error")
	}
}
