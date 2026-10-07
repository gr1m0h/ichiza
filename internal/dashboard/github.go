package dashboard

import (
	"encoding/json"
	"fmt"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"

	"github.com/gr1m0h/ichiza/internal/event"
	"github.com/gr1m0h/ichiza/internal/task"
)

type ReconcileResult struct {
	Changed bool
	State   string
}

func defaultGHOutput(args ...string) ([]byte, error) {
	return exec.Command("gh", args...).Output()
}

var ghOutput = defaultGHOutput

var validEventSlug = regexp.MustCompile(`^[a-z0-9][a-z0-9-]*$`)

// Sync refreshes one Dashboard Issue from event.yaml and tasks.yaml while
// retaining checkbox completion and operator notes.
func Sync(slug, eventsDir string) (int, error) {
	if !validEventSlug.MatchString(slug) {
		return 0, fmt.Errorf("invalid event slug %q", slug)
	}
	eventDir := filepath.Join(eventsDir, slug)
	e, err := event.Load(filepath.Join(eventDir, "event.yaml"))
	if err != nil {
		return 0, err
	}
	if e.Event.Slug != slug {
		return 0, fmt.Errorf("event slug %q does not match directory slug %q", e.Event.Slug, slug)
	}
	tasks, err := task.Load(filepath.Join(eventDir, "tasks.yaml"))
	if err != nil {
		return 0, err
	}
	out, err := ghOutput("issue", "list", "--state", "all", "--label", "ichiza:event", "--limit", "1000", "--json", "number,body")
	if err != nil {
		return 0, fmt.Errorf("gh issue list: %w", err)
	}
	var issues []struct {
		Number int    `json:"number"`
		Body   string `json:"body"`
	}
	if err := json.Unmarshal(out, &issues); err != nil {
		return 0, fmt.Errorf("parse gh issue list output: %w", err)
	}
	issueNumber := 0
	currentBody := ""
	for _, issue := range issues {
		doc, err := Parse(issue.Body)
		if err != nil {
			return 0, fmt.Errorf("issue %d dashboard: %w", issue.Number, err)
		}
		if doc.Slug != slug {
			continue
		}
		if issueNumber != 0 {
			return 0, fmt.Errorf("multiple Dashboard Issues found for event %q", slug)
		}
		issueNumber = issue.Number
		currentBody = issue.Body
	}
	if issueNumber == 0 {
		return 0, fmt.Errorf("Dashboard Issue not found for event %q", slug)
	}
	items := make([]Item, 0, len(tasks))
	for _, eventTask := range tasks {
		items = append(items, Item{Task: eventTask})
	}
	updatedBody, err := Merge(currentBody, Document{
		Slug: slug, Title: e.Event.Title, Date: e.Event.Date, Tasks: items,
	})
	if err != nil {
		return 0, err
	}
	if _, err := ghOutput("issue", "edit", strconv.Itoa(issueNumber), "--body", updatedBody); err != nil {
		return 0, fmt.Errorf("gh issue edit %d: %w", issueNumber, err)
	}
	return issueNumber, nil
}

// Reconcile keeps the Dashboard Issue state useful to GitHub Projects:
// all managed tasks done means closed; otherwise the issue stays open.
func Reconcile(issueNumber int) (ReconcileResult, error) {
	if issueNumber <= 0 {
		return ReconcileResult{}, fmt.Errorf("issue number must be positive")
	}
	number := strconv.Itoa(issueNumber)
	out, err := ghOutput("issue", "view", number, "--json", "body,state")
	if err != nil {
		return ReconcileResult{}, fmt.Errorf("gh issue view %d: %w", issueNumber, err)
	}
	var issue struct {
		Body  string `json:"body"`
		State string `json:"state"`
	}
	if err := json.Unmarshal(out, &issue); err != nil {
		return ReconcileResult{}, fmt.Errorf("parse gh issue view output: %w", err)
	}
	doc, err := Parse(issue.Body)
	if err != nil {
		return ReconcileResult{}, fmt.Errorf("issue %d dashboard: %w", issueNumber, err)
	}
	desired := "OPEN"
	if len(doc.Tasks) > 0 {
		allDone := true
		for _, item := range doc.Tasks {
			if !item.Done {
				allDone = false
				break
			}
		}
		if allDone {
			desired = "CLOSED"
		}
	}
	current := strings.ToUpper(issue.State)
	if current != "OPEN" && current != "CLOSED" {
		return ReconcileResult{}, fmt.Errorf("issue %d has unsupported state %q", issueNumber, issue.State)
	}
	if current == desired {
		return ReconcileResult{State: desired}, nil
	}
	args := []string{"issue", "reopen", number}
	if desired == "CLOSED" {
		args = []string{"issue", "close", number, "--reason", "completed"}
	}
	if _, err := ghOutput(args...); err != nil {
		return ReconcileResult{}, fmt.Errorf("gh %s issue %d: %w", args[1], issueNumber, err)
	}
	return ReconcileResult{Changed: true, State: desired}, nil
}
