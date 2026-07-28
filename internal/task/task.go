// Package task owns the on-disk schema of tasks.yaml — the dated,
// checkable task list scaffold writes and remind reads.
package task

import (
	"fmt"
	"os"
	"time"

	"gopkg.in/yaml.v3"
)

type Task struct {
	Title  string
	Due    time.Time
	Labels []string
	Done   bool
}

// doc is the YAML representation: dates stay human-readable strings.
type doc struct {
	Title  string   `yaml:"title"`
	Due    string   `yaml:"due"`
	Labels []string `yaml:"labels,omitempty"`
	Done   bool     `yaml:"done"`
}

func Save(path string, tasks []Task) error {
	docs := make([]doc, 0, len(tasks))
	for _, t := range tasks {
		docs = append(docs, doc{
			Title:  t.Title,
			Due:    t.Due.Format("2006-01-02"),
			Labels: t.Labels,
			Done:   t.Done,
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
	for _, d := range f.Tasks {
		due, err := time.Parse("2006-01-02", d.Due)
		if err != nil {
			return nil, fmt.Errorf("%s: task %q: %w", path, d.Title, err)
		}
		tasks = append(tasks, Task{Title: d.Title, Due: due, Labels: d.Labels, Done: d.Done})
	}
	return tasks, nil
}
