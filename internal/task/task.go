// Package task owns the on-disk schema of tasks.yaml — the dated task
// definitions scaffold writes and the event Dashboard Issue renders.
// Completion and runtime assignment state are deliberately absent: the
// Dashboard Issue owns them after an event is created.
package task

import (
	"fmt"
	"os"
	"regexp"
	"time"

	"gopkg.in/yaml.v3"
)

type Task struct {
	ID       string
	Title    string
	Due      time.Time
	Assignee string
	Labels   []string
	Body     string
}

// doc is the YAML representation: dates stay human-readable strings.
type doc struct {
	ID       string   `yaml:"id"`
	Title    string   `yaml:"title"`
	Due      string   `yaml:"due"`
	Assignee string   `yaml:"assignee,omitempty"`
	Labels   []string `yaml:"labels,omitempty"`
	Body     string   `yaml:"body,omitempty"`
}

var validID = regexp.MustCompile(`^[a-z0-9][a-z0-9-]*$`)

func Save(path string, tasks []Task) error {
	docs := make([]doc, 0, len(tasks))
	seen := make(map[string]bool, len(tasks))
	for _, t := range tasks {
		if err := validateID(t.ID, seen); err != nil {
			return fmt.Errorf("task %q: %w", t.Title, err)
		}
		docs = append(docs, doc{
			ID:       t.ID,
			Title:    t.Title,
			Due:      t.Due.Format("2006-01-02"),
			Assignee: t.Assignee,
			Labels:   t.Labels,
			Body:     t.Body,
		})
	}
	b, err := yaml.Marshal(map[string]any{"tasks": docs})
	if err != nil {
		return err
	}
	return os.WriteFile(path, b, 0o644)
}

func Load(path string) ([]Task, error) {
	b, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var f struct {
		Tasks []doc `yaml:"tasks"`
	}
	if err := yaml.Unmarshal(b, &f); err != nil {
		return nil, fmt.Errorf("parse %s: %w", path, err)
	}
	tasks := make([]Task, 0, len(f.Tasks))
	seen := make(map[string]bool, len(f.Tasks))
	for _, d := range f.Tasks {
		due, err := time.Parse("2006-01-02", d.Due)
		if err != nil {
			return nil, fmt.Errorf("%s: task %q: %w", path, d.Title, err)
		}
		if err := validateID(d.ID, seen); err != nil {
			return nil, fmt.Errorf("%s: task %q: %w", path, d.Title, err)
		}
		tasks = append(tasks, Task{
			ID: d.ID, Title: d.Title, Due: due, Assignee: d.Assignee,
			Labels: d.Labels, Body: d.Body,
		})
	}
	return tasks, nil
}

func validateID(id string, seen map[string]bool) error {
	if !validID.MatchString(id) {
		return fmt.Errorf("invalid id %q (want lowercase letters, numbers, and hyphens)", id)
	}
	if seen[id] {
		return fmt.Errorf("duplicate id %q", id)
	}
	seen[id] = true
	return nil
}
