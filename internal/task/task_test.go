package task

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func date(t *testing.T, s string) time.Time {
	t.Helper()
	d, err := time.Parse("2006-01-02", s)
	if err != nil {
		t.Fatal(err)
	}
	return d
}

func TestLoad(t *testing.T) {
	path := filepath.Join(t.TempDir(), "tasks.yaml")
	src := `tasks:
  - id: publish-page
    title: connpassページ公開
    due: "2026-09-30"
    labels: [announce]
  - id: venue
    title: 会場確保
    due: "2026-09-25"
`
	if err := os.WriteFile(path, []byte(src), 0o644); err != nil {
		t.Fatal(err)
	}
	tasks, err := Load(path)
	if err != nil {
		t.Fatal(err)
	}
	if len(tasks) != 2 {
		t.Fatalf("got %d tasks, want 2", len(tasks))
	}
	if tasks[0].Title != "connpassページ公開" {
		t.Errorf("title = %q", tasks[0].Title)
	}
	if !tasks[0].Due.Equal(date(t, "2026-09-30")) {
		t.Errorf("due = %v", tasks[0].Due)
	}
	if len(tasks[0].Labels) != 1 || tasks[0].Labels[0] != "announce" {
		t.Errorf("labels = %v", tasks[0].Labels)
	}
	if tasks[0].ID != "publish-page" {
		t.Errorf("id = %q", tasks[0].ID)
	}
}

func TestLoadErrors(t *testing.T) {
	tests := []struct {
		name string
		src  string
	}{
		{"bad date", "tasks:\n  - title: x\n    due: not-a-date\n"},
		{"broken yaml", "tasks: ["},
		{"missing id", "tasks:\n  - title: x\n    due: '2026-10-01'\n"},
		{"invalid id", "tasks:\n  - id: INVALID\n    title: x\n    due: '2026-10-01'\n"},
		{"duplicate id", "tasks:\n  - id: same\n    title: x\n    due: '2026-10-01'\n  - id: same\n    title: y\n    due: '2026-10-02'\n"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			path := filepath.Join(t.TempDir(), "tasks.yaml")
			if err := os.WriteFile(path, []byte(tt.src), 0o644); err != nil {
				t.Fatal(err)
			}
			if _, err := Load(path); err == nil {
				t.Error("Load() = nil error, want error")
			}
		})
	}
	t.Run("missing file", func(t *testing.T) {
		if _, err := Load(filepath.Join(t.TempDir(), "nope.yaml")); err == nil {
			t.Error("Load() = nil error, want error")
		}
	})
}

func TestSaveLoadRoundtrip(t *testing.T) {
	path := filepath.Join(t.TempDir(), "tasks.yaml")
	in := []Task{
		{ID: "announce", Title: "告知", Due: date(t, "2026-10-01"), Assignee: "alice", Labels: []string{"announce"}, Body: "告知文を確認する"},
		{ID: "setup", Title: "設営", Due: date(t, "2026-10-30")},
	}
	if err := Save(path, in); err != nil {
		t.Fatal(err)
	}
	out, err := Load(path)
	if err != nil {
		t.Fatal(err)
	}
	if len(out) != len(in) {
		t.Fatalf("got %d tasks, want %d", len(out), len(in))
	}
	for i := range in {
		if out[i].ID != in[i].ID || out[i].Title != in[i].Title || !out[i].Due.Equal(in[i].Due) || out[i].Assignee != in[i].Assignee || out[i].Body != in[i].Body {
			t.Errorf("task %d = %+v, want %+v", i, out[i], in[i])
		}
	}
	// The on-disk format keeps dates human-readable.
	b, _ := os.ReadFile(path)
	if !strings.Contains(string(b), `"2026-10-01"`) {
		t.Errorf("tasks.yaml should contain quoted date, got:\n%s", b)
	}
}
