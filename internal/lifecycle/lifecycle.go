// Package lifecycle expands an offset-based task template into
// concrete, dated tasks for one event.
package lifecycle

import (
	"fmt"
	"os"
	"regexp"
	"slices"
	"sort"
	"strconv"
	"time"

	"gopkg.in/yaml.v3"

	"github.com/gr1m0h/ichiza/internal/event"
)

type Template struct {
	Tasks []TemplateTask `yaml:"tasks"`
}

type TemplateTask struct {
	Title  string       `yaml:"title"`
	Due    string       `yaml:"due"` // e.g. "-30d", "-2w", "0d" (= event day)
	Labels []string     `yaml:"labels"`
	Modes  []event.Mode `yaml:"modes"` // empty = all modes
	Body   string       `yaml:"body"`
}

type Task struct {
	Title  string
	Due    time.Time
	Labels []string
	Body   string
}

func LoadTemplate(path string) (*Template, error) {
	b, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var t Template
	if err := yaml.Unmarshal(b, &t); err != nil {
		return nil, fmt.Errorf("parse %s: %w", path, err)
	}
	return &t, nil
}

var offsetRe = regexp.MustCompile(`^(-?\d+)([dw])$`)

// ParseOffset converts "-30d" / "-2w" into a duration in days.
func ParseOffset(s string) (int, error) {
	m := offsetRe.FindStringSubmatch(s)
	if m == nil {
		return 0, fmt.Errorf("invalid due offset %q (want e.g. -30d, -2w)", s)
	}
	n, err := strconv.Atoi(m[1])
	if err != nil {
		return 0, err
	}
	if m[2] == "w" {
		n *= 7
	}
	return n, nil
}

// Expand filters tasks by event mode and resolves due dates,
// sorted by deadline (earliest first).
func Expand(t *Template, e *event.Event) ([]Task, error) {
	date, err := e.Event.DateTime()
	if err != nil {
		return nil, fmt.Errorf("event date: %w", err)
	}
	var out []Task
	for _, tt := range t.Tasks {
		if len(tt.Modes) > 0 && !slices.Contains(tt.Modes, e.Event.Mode) {
			continue
		}
		days, err := ParseOffset(tt.Due)
		if err != nil {
			return nil, fmt.Errorf("task %q: %w", tt.Title, err)
		}
		out = append(out, Task{
			Title:  tt.Title,
			Due:    date.AddDate(0, 0, days),
			Labels: tt.Labels,
			Body:   tt.Body,
		})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Due.Before(out[j].Due) })
	return out, nil
}
