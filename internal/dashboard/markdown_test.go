package dashboard

import (
	"strings"
	"testing"
	"time"

	"github.com/gr1m0h/ichiza/internal/task"
)

func mustDate(t *testing.T, value string) time.Time {
	t.Helper()
	date, err := time.Parse("2006-01-02", value)
	if err != nil {
		t.Fatal(err)
	}
	return date
}

func TestRenderParseRoundTrip(t *testing.T) {
	doc := Document{
		Slug:  "hiroshima-3",
		Title: "SRE Lounge Hiroshima #3",
		Date:  "2026-11-01",
		Tasks: []Item{
			{Task: task.Task{ID: "venue", Title: "会場を確定する", Due: mustDate(t, "2026-10-20"), Assignee: "alice", Labels: []string{"venue"}, Body: "確認事項:\n- [ ] Wi-Fi\n- [ ] HDMI"}},
			{Task: task.Task{ID: "speaker", Title: "登壇者へ依頼する", Due: mustDate(t, "2026-10-22"), Labels: []string{"speakers"}}, Done: true},
		},
	}

	body, err := Render(doc)
	if err != nil {
		t.Fatal(err)
	}
	parsed, err := Parse(body)
	if err != nil {
		t.Fatal(err)
	}
	if parsed.Slug != doc.Slug || parsed.Title != doc.Title || parsed.Date != doc.Date || len(parsed.Tasks) != 2 {
		t.Fatalf("parsed document = %+v", parsed)
	}
	if !parsed.Tasks[1].Done || parsed.Tasks[0].Assignee != "alice" {
		t.Errorf("parsed tasks = %+v", parsed.Tasks)
	}
	if strings.Count(body, "- [ ]") != 3 {
		t.Errorf("managed and nested checkboxes should be rendered:\n%s", body)
	}
}

func TestToggleChangesOnlyManagedCheckbox(t *testing.T) {
	body, err := Render(Document{
		Slug: "hiroshima-3", Title: "Event", Date: "2026-11-01",
		Tasks: []Item{{Task: task.Task{ID: "venue", Title: "会場確保", Due: mustDate(t, "2026-10-20"), Body: "- [ ] 詳細確認"}}},
	})
	if err != nil {
		t.Fatal(err)
	}
	body += "\n## Notes\n\n- [ ] 自由記入のチェック\n"

	updated, err := Toggle(body, "venue", true)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Count(updated, "- [x]") != 1 {
		t.Errorf("only the managed checkbox should change:\n%s", updated)
	}
	if !strings.Contains(updated, "  - [ ] 詳細確認") || !strings.Contains(updated, "- [ ] 自由記入のチェック") {
		t.Errorf("nested checkbox or notes changed:\n%s", updated)
	}
}

func TestMergePreservesCompletionAndNotes(t *testing.T) {
	current, err := Render(Document{
		Slug: "event-1", Title: "Old title", Date: "2026-11-01",
		Tasks: []Item{
			{Task: task.Task{ID: "keep", Title: "Old task", Due: mustDate(t, "2026-10-20")}, Done: true},
			{Task: task.Task{ID: "remove", Title: "Remove", Due: mustDate(t, "2026-10-21")}},
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	current += "\n運営だけのメモ\n"
	desired := Document{
		Slug: "event-1", Title: "New title", Date: "2026-11-08",
		Tasks: []Item{
			{Task: task.Task{ID: "keep", Title: "Updated task", Due: mustDate(t, "2026-10-22")}},
			{Task: task.Task{ID: "add", Title: "Added task", Due: mustDate(t, "2026-10-23")}},
		},
	}

	merged, err := Merge(current, desired)
	if err != nil {
		t.Fatal(err)
	}
	parsed, err := Parse(merged)
	if err != nil {
		t.Fatal(err)
	}
	if parsed.Title != "New title" || parsed.Date != "2026-11-08" || len(parsed.Tasks) != 2 {
		t.Fatalf("merged document = %+v", parsed)
	}
	if !parsed.Tasks[0].Done || parsed.Tasks[1].Done {
		t.Errorf("completion state was not preserved by id: %+v", parsed.Tasks)
	}
	if !strings.Contains(merged, "運営だけのメモ") || strings.Contains(merged, "Remove") {
		t.Errorf("notes or task replacement is wrong:\n%s", merged)
	}
}

func TestMergePreservesRuntimeAssignee(t *testing.T) {
	current, err := Render(Document{
		Slug: "event-1", Title: "Event", Date: "2026-11-01",
		Tasks: []Item{{Task: task.Task{ID: "keep", Title: "Task", Due: mustDate(t, "2026-10-20"), Assignee: "bob"}, AssigneeSource: "runtime"}},
	})
	if err != nil {
		t.Fatal(err)
	}
	desired := Document{
		Slug: "event-1", Title: "Event", Date: "2026-11-01",
		Tasks: []Item{{Task: task.Task{ID: "keep", Title: "Task", Due: mustDate(t, "2026-10-20"), Assignee: "alice"}}},
	}

	merged, err := Merge(current, desired)
	if err != nil {
		t.Fatal(err)
	}
	parsed, err := Parse(merged)
	if err != nil {
		t.Fatal(err)
	}
	if parsed.Tasks[0].Assignee != "bob" || parsed.Tasks[0].AssigneeSource != "runtime" {
		t.Fatalf("runtime assignee was not preserved: %+v", parsed.Tasks[0])
	}
}

func TestMergePreservesRuntimeUnassignment(t *testing.T) {
	current, err := Render(Document{
		Slug: "event-1", Title: "Event", Date: "2026-11-01",
		Tasks: []Item{{Task: task.Task{ID: "keep", Title: "Task", Due: mustDate(t, "2026-10-20")}, AssigneeSource: "runtime"}},
	})
	if err != nil {
		t.Fatal(err)
	}
	desired := Document{
		Slug: "event-1", Title: "Event", Date: "2026-11-01",
		Tasks: []Item{{Task: task.Task{ID: "keep", Title: "Task", Due: mustDate(t, "2026-10-20"), Assignee: "alice"}}},
	}

	merged, err := Merge(current, desired)
	if err != nil {
		t.Fatal(err)
	}
	parsed, err := Parse(merged)
	if err != nil {
		t.Fatal(err)
	}
	if parsed.Tasks[0].Assignee != "" || parsed.Tasks[0].AssigneeSource != "runtime" {
		t.Fatalf("runtime unassignment was not preserved: %+v", parsed.Tasks[0])
	}
}

func TestParseRejectsBrokenContract(t *testing.T) {
	tests := []struct {
		name string
		body string
	}{
		{name: "missing dashboard marker", body: "- [ ] task"},
		{name: "managed checkbox without metadata", body: `<!-- ichiza-dashboard:v1 slug=event-1 date=2026-11-01 -->
# Event
<!-- ichiza-tasks:start -->
- [ ] **2026-10-20** A
<!-- ichiza-tasks:end -->`},
		{name: "managed checkbox with leading space", body: `<!-- ichiza-dashboard:v1 slug=event-1 date=2026-11-01 -->
# Event
<!-- ichiza-tasks:start -->
 - [ ] **2026-10-20** A <!-- ichiza-task:{"id":"a","due":"2026-10-20"} -->
<!-- ichiza-tasks:end -->`},
		{name: "managed checkbox with star bullet", body: `<!-- ichiza-dashboard:v1 slug=event-1 date=2026-11-01 -->
# Event
<!-- ichiza-tasks:start -->
* [ ] **2026-10-20** A <!-- ichiza-task:{"id":"a","due":"2026-10-20"} -->
<!-- ichiza-tasks:end -->`},
		{name: "managed checkbox with double space", body: `<!-- ichiza-dashboard:v1 slug=event-1 date=2026-11-01 -->
# Event
<!-- ichiza-tasks:start -->
-  [ ] **2026-10-20** A <!-- ichiza-task:{"id":"a","due":"2026-10-20"} -->
<!-- ichiza-tasks:end -->`},
		{name: "duplicate task id", body: `<!-- ichiza-dashboard:v1 slug=event-1 date=2026-11-01 -->
# Event
<!-- ichiza-tasks:start -->
- [ ] **2026-10-20** A <!-- ichiza-task:{"id":"same","due":"2026-10-20"} -->
- [ ] **2026-10-21** B <!-- ichiza-task:{"id":"same","due":"2026-10-21"} -->
<!-- ichiza-tasks:end -->`},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if _, err := Parse(tt.body); err == nil {
				t.Fatal("Parse() = nil error, want contract error")
			}
		})
	}
}
