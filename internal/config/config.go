// Package config loads ichiza.yaml, the community-level root config.
// Everything community-specific (default roles, venue, timetable,
// streaming setup, lifecycle path) lives here — never in code.
package config

import (
	"fmt"
	"os"

	"gopkg.in/yaml.v3"

	"github.com/gr1m0h/ichiza/internal/event"
)

type Config struct {
	Lifecycle string   `yaml:"lifecycle"`
	EventsDir string   `yaml:"events_dir"`
	Defaults  Defaults `yaml:"defaults"`
	Notifier  Adapter  `yaml:"notifier"`
	Registry  Adapter  `yaml:"registry"`
}

type Defaults struct {
	Mode      event.Mode       `yaml:"mode"`
	Venue     event.Venue      `yaml:"venue"`
	Roles     []string         `yaml:"roles"`
	Streaming *event.Streaming `yaml:"streaming"`
	Timetable []event.Slot     `yaml:"timetable"`
	// Role added on top of Roles when mode is hybrid/online.
	StreamingRole string `yaml:"streaming_role"`
}

type Adapter struct {
	Type string `yaml:"type"`
}

// Fallback returns the zero-config behavior: neutral, minimal defaults.
func Fallback() *Config {
	return &Config{
		Lifecycle: "templates/lifecycle.yaml",
		EventsDir: "events",
		Defaults: Defaults{
			Mode:          event.ModeOnsite,
			Roles:         []string{"organizer"},
			StreamingRole: "streaming",
		},
		Notifier: Adapter{Type: "slack"},
		Registry: Adapter{Type: "connpass"},
	}
}

// Load reads path if it exists; otherwise returns Fallback().
func Load(path string) (*Config, error) {
	b, err := os.ReadFile(path)
	if os.IsNotExist(err) {
		return Fallback(), nil
	}
	if err != nil {
		return nil, err
	}
	c := Fallback()
	if err := yaml.Unmarshal(b, c); err != nil {
		return nil, fmt.Errorf("parse %s: %w", path, err)
	}
	return c, nil
}
