// Package event defines the single source of truth: event.yaml.
package event

import (
	"fmt"
	"os"
	"time"

	"gopkg.in/yaml.v3"
)

type Mode string

const (
	ModeOnsite Mode = "onsite"
	ModeHybrid Mode = "hybrid"
	ModeOnline Mode = "online"
)

func ParseMode(s string) (Mode, error) {
	switch Mode(s) {
	case ModeOnsite, ModeHybrid, ModeOnline:
		return Mode(s), nil
	}
	return "", fmt.Errorf("invalid mode %q (onsite|hybrid|online)", s)
}

type Event struct {
	Event     Meta              `yaml:"event"`
	Venue     *Venue            `yaml:"venue,omitempty"`
	Streaming *Streaming        `yaml:"streaming,omitempty"`
	Timetable []Slot            `yaml:"timetable"`
	Speakers  []Speaker         `yaml:"speakers"`
	Roles     map[string]string `yaml:"roles"`
}

type Meta struct {
	Slug        string `yaml:"slug"`
	Title       string `yaml:"title"`
	Date        string `yaml:"date"` // YYYY-MM-DD
	Mode        Mode   `yaml:"mode"`
	ConnpassURL string `yaml:"connpass_url"`
}

func (m Meta) DateTime() (time.Time, error) {
	return time.Parse("2006-01-02", m.Date)
}

type Venue struct {
	Name       string   `yaml:"name"`
	Capacity   int      `yaml:"capacity"`
	Facilities []string `yaml:"facilities"`
	Checkin    string   `yaml:"checkin"`
}

type Streaming struct {
	Platform   string   `yaml:"platform"`
	YouTubeURL string   `yaml:"youtube_url"`
	Camera     []string `yaml:"camera"`
	Audio      string   `yaml:"audio"`
}

type Slot struct {
	Start   string `yaml:"start"`
	Title   string `yaml:"title"`
	Speaker string `yaml:"speaker,omitempty"`
}

type Speaker struct {
	Handle       string `yaml:"handle"`
	SNS          string `yaml:"sns"`
	Bio          string `yaml:"bio"`
	SessionTitle string `yaml:"session_title"`
	Remote       bool   `yaml:"remote"`
}

// SkeletonDefaults carries community-level defaults (from ichiza.yaml)
// into a fresh event. No values are hardcoded here.
type SkeletonDefaults struct {
	Venue         *Venue
	Roles         []string
	Streaming     *Streaming
	Timetable     []Slot
	StreamingRole string
}

// Skeleton returns a fresh event.yaml pre-filled from CLI flags and
// community defaults.
func Skeleton(slug, title, date string, mode Mode, d SkeletonDefaults) *Event {
	e := &Event{
		Event:     Meta{Slug: slug, Title: title, Date: date, Mode: mode},
		Timetable: d.Timetable,
		Speakers:  []Speaker{{}},
		Roles:     map[string]string{},
	}
	if mode != ModeOnline {
		e.Venue = d.Venue
		if e.Venue == nil {
			e.Venue = &Venue{}
		}
	}
	for _, r := range d.Roles {
		e.Roles[r] = ""
	}
	if mode != ModeOnsite {
		e.Streaming = d.Streaming
		if e.Streaming == nil {
			e.Streaming = &Streaming{}
		}
		if d.StreamingRole != "" {
			e.Roles[d.StreamingRole] = ""
		}
	}
	return e
}

func (e *Event) Save(path string) error {
	b, err := yaml.Marshal(e)
	if err != nil {
		return err
	}
	return os.WriteFile(path, b, 0o644)
}

func Load(path string) (*Event, error) {
	b, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var e Event
	if err := yaml.Unmarshal(b, &e); err != nil {
		return nil, fmt.Errorf("parse %s: %w", path, err)
	}
	return &e, nil
}
