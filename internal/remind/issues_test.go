package remind

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/gr1m0h/ichiza/internal/dashboard"
	"github.com/gr1m0h/ichiza/internal/task"
)

func TestParseDashboardTasks(t *testing.T) {
	body, err := dashboard.Render(dashboard.Document{
		Slug: "hiroshima-1", Title: "SRE Lounge Hiroshima #1", Date: "2026-11-01",
		Tasks: []dashboard.Item{
			{Task: task.Task{ID: "venue", Title: "会場最終確認", Due: issueDate(t, "2026-10-25")}, Done: true},
			{Task: task.Task{ID: "announce", Title: "直前リマインド", Due: issueDate(t, "2026-10-27")}},
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	out, err := json.Marshal([]map[string]string{{"body": body, "url": "https://github.example/events/1"}})
	if err != nil {
		t.Fatal(err)
	}
	states, err := parseDashboardTasks(out)
	if err != nil {
		t.Fatal(err)
	}
	if !states[taskKey("hiroshima-1", "venue")].Done {
		t.Error("checked dashboard task should be complete")
	}
	if states[taskKey("hiroshima-1", "announce")].Done {
		t.Error("unchecked dashboard task should not be complete")
	}
}

func TestParseDashboardTasksReadsRuntimeAssignee(t *testing.T) {
	body, err := dashboard.Render(dashboard.Document{
		Slug: "hiroshima-1", Title: "SRE Lounge Hiroshima #1", Date: "2026-11-01",
		Tasks: []dashboard.Item{{Task: task.Task{ID: "venue", Title: "会場最終確認", Due: issueDate(t, "2026-10-25"), Assignee: "bob"}, AssigneeSource: "runtime"}},
	})
	if err != nil {
		t.Fatal(err)
	}
	out, err := json.Marshal([]map[string]string{{"body": body, "url": "https://github.example/events/1"}})
	if err != nil {
		t.Fatal(err)
	}
	states, err := parseDashboardTasks(out)
	if err != nil {
		t.Fatal(err)
	}
	if got := states[taskKey("hiroshima-1", "venue")].Assignee; got != "bob" {
		t.Fatalf("assignee = %q, want bob", got)
	}
}

func TestParseDashboardTasksErrors(t *testing.T) {
	if _, err := parseDashboardTasks([]byte("not json")); err == nil {
		t.Fatal("want error for invalid JSON")
	}
	if _, err := parseDashboardTasks([]byte(`[{"body":"not a dashboard","url":"https://github.example/1"}]`)); err == nil {
		t.Fatal("want error for malformed dashboard issue")
	}
}

func issueDate(t *testing.T, value string) time.Time {
	t.Helper()
	due, err := time.Parse("2006-01-02", value)
	if err != nil {
		t.Fatal(err)
	}
	return due
}
