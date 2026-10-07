package dashboard

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/gr1m0h/ichiza/internal/event"
	"github.com/gr1m0h/ichiza/internal/task"
)

func reconcileIssueJSON(t *testing.T, state string, done ...bool) []byte {
	t.Helper()
	items := make([]Item, 0, len(done))
	for i, completed := range done {
		items = append(items, Item{
			Task: task.Task{
				ID:    "task-" + strconv.Itoa(i+1),
				Title: "Task",
				Due:   time.Date(2026, 10, i+1, 0, 0, 0, 0, time.UTC),
			},
			Done: completed,
		})
	}
	body, err := Render(Document{Slug: "event-1", Title: "Event", Date: "2026-11-01", Tasks: items})
	if err != nil {
		t.Fatal(err)
	}
	payload, err := json.Marshal(map[string]string{"body": body, "state": state})
	if err != nil {
		t.Fatal(err)
	}
	return payload
}

func TestSync(t *testing.T) {
	eventsDir := t.TempDir()
	slug := "event-1"
	eventDir := filepath.Join(eventsDir, slug)
	if err := os.MkdirAll(eventDir, 0o755); err != nil {
		t.Fatal(err)
	}
	e := &event.Event{Event: event.Meta{Slug: slug, Title: "Updated event", Date: "2026-11-08", Mode: event.ModeOnsite}}
	if err := e.Save(filepath.Join(eventDir, "event.yaml")); err != nil {
		t.Fatal(err)
	}
	if err := task.Save(filepath.Join(eventDir, "tasks.yaml"), []task.Task{
		{ID: "keep", Title: "Updated task", Due: mustDate(t, "2026-10-22")},
		{ID: "add", Title: "Added task", Due: mustDate(t, "2026-10-23")},
	}); err != nil {
		t.Fatal(err)
	}
	current, err := Render(Document{
		Slug: slug, Title: "Old event", Date: "2026-11-01",
		Tasks: []Item{{Task: task.Task{ID: "keep", Title: "Old task", Due: mustDate(t, "2026-10-20")}, Done: true}},
	})
	if err != nil {
		t.Fatal(err)
	}
	current += "\nNotes stay here\n"
	listOutput, err := json.Marshal([]map[string]any{{"number": 42, "body": current}})
	if err != nil {
		t.Fatal(err)
	}
	var calls [][]string
	ghOutput = func(args ...string) ([]byte, error) {
		calls = append(calls, append([]string(nil), args...))
		if len(calls) == 1 {
			return listOutput, nil
		}
		return nil, nil
	}
	t.Cleanup(func() { ghOutput = defaultGHOutput })

	issueNumber, err := Sync(slug, eventsDir)
	if err != nil {
		t.Fatal(err)
	}
	if issueNumber != 42 || len(calls) != 2 {
		t.Fatalf("Sync() issue=%d calls=%v", issueNumber, calls)
	}
	if !reflect.DeepEqual(calls[0], []string{"issue", "list", "--state", "all", "--label", "ichiza:event", "--limit", "1000", "--json", "number,body"}) {
		t.Errorf("list call = %v", calls[0])
	}
	if len(calls[1]) != 5 || calls[1][0] != "issue" || calls[1][1] != "edit" || calls[1][2] != "42" || calls[1][3] != "--body" {
		t.Fatalf("edit call = %v", calls[1])
	}
	updated := calls[1][4]
	parsed, err := Parse(updated)
	if err != nil {
		t.Fatal(err)
	}
	if parsed.Title != "Updated event" || parsed.Date != "2026-11-08" || !parsed.Tasks[0].Done {
		t.Errorf("synced dashboard = %+v", parsed)
	}
	if !strings.Contains(updated, "Notes stay here") {
		t.Errorf("notes were lost: %s", updated)
	}
}

func TestReconcile(t *testing.T) {
	tests := []struct {
		name      string
		state     string
		done      []bool
		wantCalls [][]string
		changed   bool
	}{
		{name: "closes all-done open dashboard", state: "OPEN", done: []bool{true, true}, wantCalls: [][]string{{"issue", "view", "42", "--json", "body,state"}, {"issue", "close", "42", "--reason", "completed"}}, changed: true},
		{name: "reopens incomplete closed dashboard", state: "CLOSED", done: []bool{true, false}, wantCalls: [][]string{{"issue", "view", "42", "--json", "body,state"}, {"issue", "reopen", "42"}}, changed: true},
		{name: "keeps matching state", state: "OPEN", done: []bool{false}, wantCalls: [][]string{{"issue", "view", "42", "--json", "body,state"}}, changed: false},
		{name: "keeps empty dashboard open", state: "OPEN", done: nil, wantCalls: [][]string{{"issue", "view", "42", "--json", "body,state"}}, changed: false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var calls [][]string
			ghOutput = func(args ...string) ([]byte, error) {
				calls = append(calls, append([]string(nil), args...))
				if len(calls) == 1 {
					return reconcileIssueJSON(t, tt.state, tt.done...), nil
				}
				return nil, nil
			}
			t.Cleanup(func() { ghOutput = defaultGHOutput })

			result, err := Reconcile(42)
			if err != nil {
				t.Fatal(err)
			}
			if result.Changed != tt.changed {
				t.Errorf("Changed = %v, want %v", result.Changed, tt.changed)
			}
			if !reflect.DeepEqual(calls, tt.wantCalls) {
				t.Errorf("gh calls = %v, want %v", calls, tt.wantCalls)
			}
		})
	}
}

func TestReconcileErrors(t *testing.T) {
	tests := []struct {
		name   string
		issue  int
		output []byte
		err    error
	}{
		{name: "invalid issue", issue: 0},
		{name: "gh failure", issue: 42, err: errors.New("offline")},
		{name: "invalid json", issue: 42, output: []byte("not json")},
		{name: "invalid dashboard", issue: 42, output: []byte(`{"body":"ordinary issue","state":"OPEN"}`)},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ghOutput = func(args ...string) ([]byte, error) { return tt.output, tt.err }
			t.Cleanup(func() { ghOutput = defaultGHOutput })

			if _, err := Reconcile(tt.issue); err == nil {
				t.Fatal("Reconcile() = nil error, want error")
			}
		})
	}
}
