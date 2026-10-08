package lifecycle

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/gr1m0h/ichiza/internal/event"
)

func TestLoadTemplate(t *testing.T) {
	t.Run("valid", func(t *testing.T) {
		path := filepath.Join(t.TempDir(), "lifecycle.yaml")
		src := "tasks:\n  - id: announce\n    title: 告知\n    due: -7d\n    assignee: alice\n    labels: [announce]\n    modes: [hybrid]\n    body: 告知文を確認する\n"
		if err := os.WriteFile(path, []byte(src), 0o644); err != nil {
			t.Fatal(err)
		}
		tpl, err := LoadTemplate(path)
		if err != nil {
			t.Fatal(err)
		}
		if len(tpl.Tasks) != 1 || tpl.Tasks[0].ID != "announce" || tpl.Tasks[0].Assignee != "alice" || tpl.Tasks[0].Body != "告知文を確認する" || tpl.Tasks[0].Modes[0] != event.ModeHybrid {
			t.Errorf("template = %+v", tpl)
		}
	})
	t.Run("missing file", func(t *testing.T) {
		if _, err := LoadTemplate(filepath.Join(t.TempDir(), "nope.yaml")); err == nil {
			t.Error("LoadTemplate(missing) = nil error, want error")
		}
	})
	t.Run("broken yaml", func(t *testing.T) {
		path := filepath.Join(t.TempDir(), "lifecycle.yaml")
		if err := os.WriteFile(path, []byte("tasks: ["), 0o644); err != nil {
			t.Fatal(err)
		}
		if _, err := LoadTemplate(path); err == nil {
			t.Error("LoadTemplate(broken) = nil error, want error")
		}
	})
}

func TestParseOffset(t *testing.T) {
	tests := []struct {
		in      string
		want    int
		wantErr bool
	}{
		{"-30d", -30, false},
		{"-2w", -14, false},
		{"0d", 0, false},
		{"7d", 7, false},
		{"1w", 7, false},
		{"", 0, true},
		{"30", 0, true},
		{"-30x", 0, true},
		{"d", 0, true},
	}
	for _, tt := range tests {
		t.Run(tt.in, func(t *testing.T) {
			got, err := ParseOffset(tt.in)
			if (err != nil) != tt.wantErr {
				t.Fatalf("err = %v, wantErr = %v", err, tt.wantErr)
			}
			if got != tt.want {
				t.Errorf("ParseOffset(%q) = %d, want %d", tt.in, got, tt.want)
			}
		})
	}
}

func TestExpand(t *testing.T) {
	tpl := &Template{Tasks: []TemplateTask{
		{ID: "announce", Title: "告知", Due: "-7d", Assignee: "alice", Labels: []string{"announce"}, Body: "告知文を確認する"},
		{ID: "rehearsal", Title: "配信リハ", Due: "-3d", Modes: []event.Mode{event.ModeHybrid, event.ModeOnline}},
		{ID: "venue", Title: "会場確保", Due: "-5w", Modes: []event.Mode{event.ModeOnsite, event.ModeHybrid}},
		{ID: "retro", Title: "振り返り", Due: "10d"},
	}}

	t.Run("hybrid expands all, sorted by due", func(t *testing.T) {
		e := &event.Event{Event: event.Meta{Date: "2026-10-30", Mode: event.ModeHybrid}}
		tasks, err := Expand(tpl, e)
		if err != nil {
			t.Fatal(err)
		}
		wantOrder := []string{"会場確保", "告知", "配信リハ", "振り返り"}
		if len(tasks) != len(wantOrder) {
			t.Fatalf("got %d tasks, want %d", len(tasks), len(wantOrder))
		}
		for i, w := range wantOrder {
			if tasks[i].Title != w {
				t.Errorf("tasks[%d] = %q, want %q", i, tasks[i].Title, w)
			}
		}
		if got := tasks[0].Due.Format("2006-01-02"); got != "2026-09-25" {
			t.Errorf("-5w from 2026-10-30 = %s, want 2026-09-25", got)
		}
		if got := tasks[3].Due.Format("2006-01-02"); got != "2026-11-09" {
			t.Errorf("+10d from 2026-10-30 = %s, want 2026-11-09", got)
		}
		if tasks[1].ID != "announce" || tasks[1].Assignee != "alice" || tasks[1].Body != "告知文を確認する" {
			t.Errorf("task metadata lost: %+v", tasks[1])
		}
		if tasks[0].ID != "venue" || tasks[2].ID != "rehearsal" {
			t.Errorf("task IDs changed: %+v", tasks)
		}
	})

	t.Run("online filters onsite-only tasks", func(t *testing.T) {
		e := &event.Event{Event: event.Meta{Date: "2026-10-30", Mode: event.ModeOnline}}
		tasks, err := Expand(tpl, e)
		if err != nil {
			t.Fatal(err)
		}
		for _, task := range tasks {
			if task.Title == "会場確保" {
				t.Error("online event should not include 会場確保")
			}
		}
	})

	t.Run("bad event date", func(t *testing.T) {
		e := &event.Event{Event: event.Meta{Date: "someday", Mode: event.ModeOnsite}}
		if _, err := Expand(tpl, e); err == nil {
			t.Error("Expand() = nil error, want error")
		}
	})

	t.Run("bad offset", func(t *testing.T) {
		bad := &Template{Tasks: []TemplateTask{{ID: "x", Title: "x", Due: "yesterday"}}}
		e := &event.Event{Event: event.Meta{Date: "2026-10-30", Mode: event.ModeOnsite}}
		if _, err := Expand(bad, e); err == nil {
			t.Error("Expand() = nil error, want error")
		}
	})

	t.Run("missing task id", func(t *testing.T) {
		bad := &Template{Tasks: []TemplateTask{{Title: "x", Due: "-1d"}}}
		e := &event.Event{Event: event.Meta{Date: "2026-10-30", Mode: event.ModeOnsite}}
		if _, err := Expand(bad, e); err == nil {
			t.Error("Expand() = nil error, want error")
		}
	})
}
