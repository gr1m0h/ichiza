// Dashboard lookup: the checkbox in each event's single Dashboard Issue owns
// task completion state. tasks.yaml stays a pure definition of what is due.
package remind

import (
	"encoding/json"
	"fmt"
	"os/exec"

	"github.com/gr1m0h/ichiza/internal/dashboard"
)

// execCommand is swapped in tests so DashboardTasks can run without gh.
var execCommand = exec.Command

func taskKey(slug, id string) string {
	return slug + "\x00" + id
}

type TaskState struct {
	Done     bool
	Assignee string
}

// DashboardTasks returns runtime state from all labelled event Dashboard
// Issues in the current repository via the gh CLI.
func DashboardTasks() (map[string]TaskState, error) {
	out, err := execCommand("gh", "issue", "list",
		"--state", "all", "--limit", "500", "--label", "ichiza:event", "--json", "body,url").Output()
	if err != nil {
		return nil, fmt.Errorf("gh issue list: %w", err)
	}
	return parseDashboardTasks(out)
}

func parseDashboardTasks(out []byte) (map[string]TaskState, error) {
	var issues []struct {
		Body string `json:"body"`
		URL  string `json:"url"`
	}
	if err := json.Unmarshal(out, &issues); err != nil {
		return nil, fmt.Errorf("parse gh issue list output: %w", err)
	}
	states := make(map[string]TaskState)
	seenSlugs := make(map[string]bool, len(issues))
	for _, is := range issues {
		doc, err := dashboard.Parse(is.Body)
		if err != nil {
			return nil, fmt.Errorf("parse dashboard %s: %w", is.URL, err)
		}
		if seenSlugs[doc.Slug] {
			return nil, fmt.Errorf("duplicate dashboard for event %q", doc.Slug)
		}
		seenSlugs[doc.Slug] = true
		for _, item := range doc.Tasks {
			states[taskKey(doc.Slug, item.ID)] = TaskState{Done: item.Done, Assignee: item.Assignee}
		}
	}
	return states, nil
}
