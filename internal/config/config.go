// Package config loads ichiza.yaml, the community-level root config.
// Everything community-specific (default roles, venue, timetable,
// streaming setup, lifecycle path) lives here — never in code.
package config

import (
	"encoding/json"
	"fmt"
	"os"
	"regexp"
	"strings"
	"time"

	"gopkg.in/yaml.v3"

	"github.com/gr1m0h/ichiza/internal/event"
)

type Config struct {
	Lifecycle string   `yaml:"lifecycle"`
	EventsDir string   `yaml:"events_dir"`
	Timezone  string   `yaml:"timezone"`
	Members   []Member `yaml:"members"`
	Defaults  Defaults `yaml:"defaults"`
	Notifier  Adapter  `yaml:"notifier"`
	Registry  Registry `yaml:"registry"`
}

type Member struct {
	GitHub      string `yaml:"github"`
	Email       string `yaml:"email"`
	SlackUserID string `yaml:"slack_user_id,omitempty"`
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

// Registry configures the event registration page adapter and the
// community-editable draft templates (empty = built-in defaults).
type Registry struct {
	Type      string            `yaml:"type"`
	Templates RegistryTemplates `yaml:"templates"`
}

type RegistryTemplates struct {
	Page    string `yaml:"page"`
	Speaker string `yaml:"speaker"`
}

// Fallback returns the zero-config behavior: neutral, minimal defaults.
func Fallback() *Config {
	return &Config{
		Lifecycle: "templates/lifecycle.yaml",
		EventsDir: "events",
		Timezone:  "Asia/Tokyo",
		Defaults: Defaults{
			Mode:          event.ModeOnsite,
			Roles:         []string{"organizer"},
			StreamingRole: "streaming",
		},
		Notifier: Adapter{Type: "slack"},
		Registry: Registry{Type: "connpass"},
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
	if err := validate(c); err != nil {
		return nil, fmt.Errorf("validate %s: %w", path, err)
	}
	return c, nil
}

var (
	githubLogin  = regexp.MustCompile(`^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$`)
	emailAddress = regexp.MustCompile(`^[^@\s]+@[^@\s]+$`)
	slackUserID  = regexp.MustCompile(`^[UW][A-Z0-9]+$`)
)

func validate(c *Config) error {
	if _, err := time.LoadLocation(c.Timezone); err != nil {
		return fmt.Errorf("timezone %q: %w", c.Timezone, err)
	}
	githubSeen := make(map[string]bool, len(c.Members))
	emailSeen := make(map[string]bool, len(c.Members))
	for i := range c.Members {
		member := &c.Members[i]
		member.Email = strings.ToLower(strings.TrimSpace(member.Email))
		if !githubLogin.MatchString(member.GitHub) {
			return fmt.Errorf("member %d: invalid github login %q", i, member.GitHub)
		}
		if !emailAddress.MatchString(member.Email) {
			return fmt.Errorf("member %q: invalid email %q", member.GitHub, member.Email)
		}
		if member.SlackUserID != "" && !slackUserID.MatchString(member.SlackUserID) {
			return fmt.Errorf("member %q: invalid slack_user_id %q", member.GitHub, member.SlackUserID)
		}
		if githubSeen[member.GitHub] {
			return fmt.Errorf("duplicate member github %q", member.GitHub)
		}
		if emailSeen[member.Email] {
			return fmt.Errorf("duplicate member email %q", member.Email)
		}
		githubSeen[member.GitHub] = true
		emailSeen[member.Email] = true
	}
	return nil
}

func (c *Config) WebConfigJSON() (string, error) {
	type webMember struct {
		Email  string `json:"email"`
		GitHub string `json:"github"`
	}
	type webConfig struct {
		Timezone string      `json:"timezone"`
		Members  []webMember `json:"members"`
	}
	members := make([]webMember, 0, len(c.Members))
	for _, member := range c.Members {
		members = append(members, webMember{Email: member.Email, GitHub: member.GitHub})
	}
	encoded, err := json.Marshal(webConfig{Timezone: c.Timezone, Members: members})
	if err != nil {
		return "", fmt.Errorf("encode web members: %w", err)
	}
	return string(encoded), nil
}

func (c *Config) SlackUsersByGitHub() map[string]string {
	users := make(map[string]string, len(c.Members))
	for _, member := range c.Members {
		if member.SlackUserID != "" {
			users[member.GitHub] = member.SlackUserID
		}
	}
	return users
}
