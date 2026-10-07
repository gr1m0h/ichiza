// Package scaffold materializes a new event: directory, event.yaml,
// tasks.yaml, and (optionally) one GitHub Dashboard Issue via the gh CLI.
package scaffold

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"

	"github.com/gr1m0h/ichiza/internal/config"
	"github.com/gr1m0h/ichiza/internal/dashboard"
	"github.com/gr1m0h/ichiza/internal/event"
	"github.com/gr1m0h/ichiza/internal/lifecycle"
	"github.com/gr1m0h/ichiza/internal/task"
)

type Options struct {
	Slug            string
	Title           string
	Date            string // YYYY-MM-DD
	Mode            event.Mode
	LifecyclePath   string // overrides config when non-empty
	BaseDir         string // overrides config when non-empty
	CreateDashboard bool
	Config          *config.Config
}

type Result struct {
	Dir   string
	Tasks []lifecycle.Task
}

// slug is used verbatim as a directory and branch name,
// so restrict its character set to prevent path traversal.
var validSlug = regexp.MustCompile(`^[a-z0-9][a-z0-9-]*$`)

func Run(opt Options) (*Result, error) {
	if !validSlug.MatchString(opt.Slug) {
		return nil, fmt.Errorf("invalid slug %q: must match %s", opt.Slug, validSlug)
	}
	cfg := opt.Config
	if cfg == nil {
		cfg = config.Fallback()
	}
	if opt.BaseDir == "" {
		opt.BaseDir = cfg.EventsDir
	}
	if opt.LifecyclePath == "" {
		opt.LifecyclePath = cfg.Lifecycle
	}
	dir := filepath.Join(opt.BaseDir, opt.Slug)
	if _, err := os.Stat(dir); err == nil {
		return nil, fmt.Errorf("%s already exists", dir)
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, err
	}

	venue := cfg.Defaults.Venue
	e := event.Skeleton(opt.Slug, opt.Title, opt.Date, opt.Mode, event.SkeletonDefaults{
		Venue:         &venue,
		Roles:         cfg.Defaults.Roles,
		Streaming:     cfg.Defaults.Streaming,
		Timetable:     cfg.Defaults.Timetable,
		StreamingRole: cfg.Defaults.StreamingRole,
	})
	if err := e.Save(filepath.Join(dir, "event.yaml")); err != nil {
		return nil, err
	}

	tpl, err := lifecycle.LoadTemplate(opt.LifecyclePath)
	if err != nil {
		return nil, err
	}
	tasks, err := lifecycle.Expand(tpl, e)
	if err != nil {
		return nil, err
	}
	if err := saveTasks(filepath.Join(dir, "tasks.yaml"), tasks); err != nil {
		return nil, err
	}

	if opt.CreateDashboard {
		if err := createDashboardIssue(e, tasks); err != nil {
			return nil, fmt.Errorf("create dashboard issue: %w", err)
		}
	}
	return &Result{Dir: dir, Tasks: tasks}, nil
}

func saveTasks(path string, tasks []lifecycle.Task) error {
	docs := make([]task.Task, 0, len(tasks))
	for _, t := range tasks {
		docs = append(docs, task.Task{
			ID: t.ID, Title: t.Title, Due: t.Due, Assignee: t.Assignee,
			Labels: t.Labels, Body: t.Body,
		})
	}
	return task.Save(path, docs)
}

// execCommand is swapped in tests so createDashboardIssue can run without gh.
var execCommand = exec.Command

func createDashboardIssue(e *event.Event, tasks []lifecycle.Task) error {
	body, err := dashboardBody(e, tasks)
	if err != nil {
		return err
	}
	// Best effort: the shared label may already exist.
	_ = execCommand("gh", "label", "create", "ichiza:event").Run()
	cmd := execCommand("gh", "issue", "create",
		"--title", e.Event.Title+" 運営Dashboard",
		"--body", body,
		"--label", "ichiza:event",
	)
	cmd.Stdout, cmd.Stderr = os.Stdout, os.Stderr
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("event %q: %w", e.Event.Slug, err)
	}
	return nil
}

func dashboardBody(e *event.Event, tasks []lifecycle.Task) (string, error) {
	items := make([]dashboard.Item, 0, len(tasks))
	for _, lifecycleTask := range tasks {
		items = append(items, dashboard.Item{Task: task.Task{
			ID: lifecycleTask.ID, Title: lifecycleTask.Title, Due: lifecycleTask.Due,
			Assignee: lifecycleTask.Assignee, Labels: lifecycleTask.Labels, Body: lifecycleTask.Body,
		}})
	}
	return dashboard.Render(dashboard.Document{Slug: e.Event.Slug, Title: e.Event.Title, Date: e.Event.Date, Tasks: items})
}
