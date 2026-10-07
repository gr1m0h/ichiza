package dashboard

import (
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
	"time"

	"github.com/gr1m0h/ichiza/internal/task"
)

const (
	tasksStart = "<!-- ichiza-tasks:start -->"
	tasksEnd   = "<!-- ichiza-tasks:end -->"
)

var (
	dashboardMarker = regexp.MustCompile(`^<!-- ichiza-dashboard:v1 slug=([a-z0-9][a-z0-9-]*) date=(\d{4}-\d{2}-\d{2}) -->$`)
	managedTaskLine = regexp.MustCompile(`^- \[([ xX])\] \*\*(\d{4}-\d{2}-\d{2})\*\* (.+?)(?: · @([A-Za-z0-9-]+))? <!-- ichiza-task:(\{.*\}) -->\r?$`)
)

type metadata struct {
	ID       string   `json:"id"`
	Due      string   `json:"due"`
	Assignee string   `json:"assignee,omitempty"`
	Labels   []string `json:"labels,omitempty"`
}

func Render(doc Document) (string, error) {
	marker := "<!-- ichiza-dashboard:v1 slug=" + doc.Slug + " date=" + doc.Date + " -->"
	if !dashboardMarker.MatchString(marker) {
		return "", fmt.Errorf("invalid event slug %q", doc.Slug)
	}
	if _, err := time.Parse("2006-01-02", doc.Date); err != nil {
		return "", fmt.Errorf("invalid event date %q: %w", doc.Date, err)
	}
	seen := make(map[string]bool, len(doc.Tasks))
	var out strings.Builder
	fmt.Fprintf(&out, "%s\n\n# %s\n\n%s\n", marker, doc.Title, tasksStart)
	for _, item := range doc.Tasks {
		if item.ID == "" {
			return "", fmt.Errorf("task %q has no id", item.Title)
		}
		if seen[item.ID] {
			return "", fmt.Errorf("duplicate task id %q", item.ID)
		}
		seen[item.ID] = true
		meta, err := json.Marshal(metadata{
			ID: item.ID, Due: item.Due.Format("2006-01-02"),
			Assignee: item.Assignee, Labels: item.Labels,
		})
		if err != nil {
			return "", fmt.Errorf("task %q metadata: %w", item.ID, err)
		}
		mark := " "
		if item.Done {
			mark = "x"
		}
		assignee := ""
		if item.Assignee != "" {
			assignee = " · @" + item.Assignee
		}
		fmt.Fprintf(&out, "- [%s] **%s** %s%s <!-- ichiza-task:%s -->\n",
			mark, item.Due.Format("2006-01-02"), item.Title, assignee, meta)
		if item.Body != "" {
			for _, line := range strings.Split(item.Body, "\n") {
				fmt.Fprintf(&out, "  %s\n", line)
			}
		}
	}
	fmt.Fprintf(&out, "%s\n\n## Notes\n", tasksEnd)
	return out.String(), nil
}

func Parse(body string) (Document, error) {
	normalized := strings.ReplaceAll(body, "\r\n", "\n")
	lines := strings.Split(normalized, "\n")
	if len(lines) == 0 {
		return Document{}, fmt.Errorf("missing dashboard marker")
	}
	marker := dashboardMarker.FindStringSubmatch(lines[0])
	if marker == nil {
		return Document{}, fmt.Errorf("missing dashboard marker")
	}
	if _, err := time.Parse("2006-01-02", marker[2]); err != nil {
		return Document{}, fmt.Errorf("invalid event date %q: %w", marker[2], err)
	}
	doc := Document{Slug: marker[1], Date: marker[2]}
	inTasks := false
	seen := map[string]bool{}
	for i := 1; i < len(lines); i++ {
		line := lines[i]
		switch line {
		case tasksStart:
			if inTasks {
				return Document{}, fmt.Errorf("duplicate tasks start marker")
			}
			inTasks = true
			continue
		case tasksEnd:
			if !inTasks {
				return Document{}, fmt.Errorf("tasks end marker before start")
			}
			return doc, nil
		}
		if !inTasks {
			if doc.Title == "" && strings.HasPrefix(line, "# ") {
				doc.Title = strings.TrimPrefix(line, "# ")
			}
			continue
		}
		match := managedTaskLine.FindStringSubmatch(line)
		if match == nil {
			if line == "" {
				continue
			}
			if strings.HasPrefix(line, "  ") && len(doc.Tasks) > 0 {
				item := &doc.Tasks[len(doc.Tasks)-1]
				if item.Body != "" {
					item.Body += "\n"
				}
				item.Body += strings.TrimPrefix(line, "  ")
				continue
			}
			return Document{}, fmt.Errorf("invalid managed task line %q", line)
		}
		var meta metadata
		if err := json.Unmarshal([]byte(match[5]), &meta); err != nil {
			return Document{}, fmt.Errorf("invalid task metadata: %w", err)
		}
		if seen[meta.ID] {
			return Document{}, fmt.Errorf("duplicate task id %q", meta.ID)
		}
		seen[meta.ID] = true
		due, err := time.Parse("2006-01-02", meta.Due)
		if err != nil {
			return Document{}, fmt.Errorf("task %q due: %w", meta.ID, err)
		}
		if match[2] != meta.Due || match[4] != meta.Assignee {
			return Document{}, fmt.Errorf("task %q visible metadata does not match marker", meta.ID)
		}
		doc.Tasks = append(doc.Tasks, Item{Task: task.Task{
			ID: meta.ID, Title: match[3], Due: due, Assignee: meta.Assignee, Labels: meta.Labels,
		}, Done: strings.EqualFold(match[1], "x")})
	}
	return Document{}, fmt.Errorf("missing tasks end marker")
}

// Merge replaces the managed event and task data while preserving checkbox
// completion by task ID and everything after the managed task range.
func Merge(current string, desired Document) (string, error) {
	existing, err := Parse(current)
	if err != nil {
		return "", err
	}
	if existing.Slug != desired.Slug {
		return "", fmt.Errorf("dashboard slug %q does not match desired slug %q", existing.Slug, desired.Slug)
	}
	completed := make(map[string]bool, len(existing.Tasks))
	for _, item := range existing.Tasks {
		completed[item.ID] = item.Done
	}
	merged := desired
	merged.Tasks = make([]Item, len(desired.Tasks))
	copy(merged.Tasks, desired.Tasks)
	for i := range merged.Tasks {
		merged.Tasks[i].Done = completed[merged.Tasks[i].ID]
	}
	rendered, err := Render(merged)
	if err != nil {
		return "", err
	}
	normalized := strings.ReplaceAll(current, "\r\n", "\n")
	currentEnd := strings.Index(normalized, tasksEnd)
	renderedEnd := strings.Index(rendered, tasksEnd)
	if currentEnd < 0 || renderedEnd < 0 {
		return "", fmt.Errorf("missing tasks end marker")
	}
	return rendered[:renderedEnd+len(tasksEnd)] + normalized[currentEnd+len(tasksEnd):], nil
}

// Toggle changes one managed top-level checkbox and preserves all other text.
func Toggle(body, id string, done bool) (string, error) {
	lines := strings.Split(body, "\n")
	matches := 0
	for i, line := range lines {
		match := managedTaskLine.FindStringSubmatch(line)
		if match == nil {
			continue
		}
		var meta metadata
		if err := json.Unmarshal([]byte(match[5]), &meta); err != nil {
			return "", fmt.Errorf("invalid task metadata: %w", err)
		}
		if meta.ID != id {
			continue
		}
		matches++
		mark := " "
		if done {
			mark = "x"
		}
		lines[i] = line[:3] + mark + line[4:]
	}
	if matches == 0 {
		return "", fmt.Errorf("task %q not found", id)
	}
	if matches > 1 {
		return "", fmt.Errorf("duplicate task id %q", id)
	}
	return strings.Join(lines, "\n"), nil
}
