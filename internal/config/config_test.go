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
	if c.Timezone != "Asia/Tokyo" {
		t.Errorf("Timezone = %q, want Asia/Tokyo", c.Timezone)
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
timezone: Asia/Tokyo
members:
  - github: alice
    email: Alice@example.com
    slack_user_id: U012ABC
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
	if got := c.SlackUsersByGitHub()["alice"]; got != "U012ABC" {
		t.Errorf("SlackUsersByGitHub()[alice] = %q", got)
	}
	if c.Members[0].Email != "alice@example.com" {
		t.Errorf("member email should be normalized: %q", c.Members[0].Email)
	}
	// Unspecified keys keep their fallback values
	if c.EventsDir != "events" || c.Lifecycle != "templates/lifecycle.yaml" {
		t.Errorf("unspecified keys lost fallback: %+v", c)
	}
}

func TestLoadRejectsInvalidOperatorConfiguration(t *testing.T) {
	tests := []struct {
		name string
		src  string
	}{
		{"timezone", "timezone: Mars/Olympus\n"},
		{"missing github", "members:\n  - email: alice@example.com\n"},
		{"missing email", "members:\n  - github: alice\n"},
		{"invalid slack id", "members:\n  - github: alice\n    email: alice@example.com\n    slack_user_id: alice\n"},
		{"duplicate github", "members:\n  - github: alice\n    email: a@example.com\n  - github: alice\n    email: b@example.com\n"},
		{"duplicate email", "members:\n  - github: alice\n    email: SAME@example.com\n  - github: bob\n    email: same@example.com\n"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			path := filepath.Join(t.TempDir(), "ichiza.yaml")
			if err := os.WriteFile(path, []byte(tt.src), 0o644); err != nil {
				t.Fatal(err)
			}
			if _, err := Load(path); err == nil {
				t.Error("Load() = nil error, want error")
			}
		})
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

func TestWebConfigJSON(t *testing.T) {
	c := &Config{Timezone: "Asia/Tokyo", Members: []Member{
		{GitHub: "alice", Email: "alice@example.com", SlackUserID: "U012ABC"},
		{GitHub: "bob", Email: "bob@example.com"},
	}}

	got, err := c.WebConfigJSON()
	if err != nil {
		t.Fatal(err)
	}
	want := `{"timezone":"Asia/Tokyo","members":[{"email":"alice@example.com","github":"alice"},{"email":"bob@example.com","github":"bob"}]}`
	if got != want {
		t.Errorf("WebConfigJSON() = %s, want %s", got, want)
	}
}

func TestWebConfigJSONEmpty(t *testing.T) {
	got, err := (&Config{Timezone: "Asia/Tokyo"}).WebConfigJSON()
	if err != nil {
		t.Fatal(err)
	}
	if got != `{"timezone":"Asia/Tokyo","members":[]}` {
		t.Errorf("WebConfigJSON() = %s, want empty members", got)
	}
}
