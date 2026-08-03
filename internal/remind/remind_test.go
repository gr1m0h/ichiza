package remind

import (
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/gr1m0h/ichiza/internal/event"
	"github.com/gr1m0h/ichiza/internal/task"
)

func date(t *testing.T, s string) time.Time {
	t.Helper()
	d, err := time.Parse("2006-01-02", s)
	if err != nil {
		t.Fatal(err)
	}
	return d
}

func writeEventDir(t *testing.T, eventsDir, slug, title, dateStr, connpass string, tasks []task.Task) {
	t.Helper()
	dir := filepath.Join(eventsDir, slug)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	e := &event.Event{Event: event.Meta{
		Slug: slug, Title: title, Date: dateStr,
		Mode: event.ModeHybrid, ConnpassURL: connpass,
	}}
	if err := e.Save(filepath.Join(dir, "event.yaml")); err != nil {
		t.Fatal(err)
	}
	if err := task.Save(filepath.Join(dir, "tasks.yaml"), tasks); err != nil {
		t.Fatal(err)
	}
}

func TestCollect(t *testing.T) {
	eventsDir := filepath.Join(t.TempDir(), "events")
	writeEventDir(t, eventsDir, "hiroshima-1", "SRE Lounge Hiroshima #1", "2026-10-30", "", []task.Task{
		{Title: "期限超過タスク", Due: date(t, "2026-10-25")},
		{Title: "完了済みタスク", Due: date(t, "2026-10-28"), Done: true},
		{Title: "本日期限タスク", Due: date(t, "2026-10-27")},
		{Title: "期限内タスク", Due: date(t, "2026-10-30")},
		{Title: "期限外タスク", Due: date(t, "2026-11-10")},
	})
	// Directories without tasks.yaml are skipped
	if err := os.MkdirAll(filepath.Join(eventsDir, "not-an-event"), 0o755); err != nil {
		t.Fatal(err)
	}

	digests, err := Collect(Options{EventsDir: eventsDir, Now: date(t, "2026-10-27"), WindowDays: 7})
	if err != nil {
		t.Fatal(err)
	}
	if len(digests) != 1 {
		t.Fatalf("got %d digests, want 1", len(digests))
	}
	d := digests[0]
	if d.Event.Event.Slug != "hiroshima-1" {
		t.Errorf("slug = %q", d.Event.Event.Slug)
	}
	want := []struct {
		title    string
		daysLeft int
	}{
		{"期限超過タスク", -2},
		{"本日期限タスク", 0},
		{"期限内タスク", 3},
	}
	if len(d.Items) != len(want) {
		t.Fatalf("got %d items, want %d: %+v", len(d.Items), len(want), d.Items)
	}
	for i, w := range want {
		if d.Items[i].Task.Title != w.title {
			t.Errorf("items[%d].Title = %q, want %q", i, d.Items[i].Task.Title, w.title)
		}
		if d.Items[i].DaysLeft != w.daysLeft {
			t.Errorf("items[%d].DaysLeft = %d, want %d", i, d.Items[i].DaysLeft, w.daysLeft)
		}
	}
}

func TestCollectAllDone(t *testing.T) {
	eventsDir := filepath.Join(t.TempDir(), "events")
	writeEventDir(t, eventsDir, "done-1", "Done", "2026-10-30", "", []task.Task{
		{Title: "済", Due: date(t, "2026-10-28"), Done: true},
	})
	digests, err := Collect(Options{EventsDir: eventsDir, Now: date(t, "2026-10-27"), WindowDays: 7})
	if err != nil {
		t.Fatal(err)
	}
	if len(digests) != 0 {
		t.Errorf("got %d digests, want 0", len(digests))
	}
}

func TestCollectMissingEventsDir(t *testing.T) {
	digests, err := Collect(Options{
		EventsDir: filepath.Join(t.TempDir(), "no-such-dir"),
		Now:       date(t, "2026-10-27"), WindowDays: 7,
	})
	if err != nil {
		t.Fatalf("missing events dir should not error, got %v", err)
	}
	if len(digests) != 0 {
		t.Errorf("got %d digests, want 0", len(digests))
	}
}

func TestMessage(t *testing.T) {
	e := &event.Event{Event: event.Meta{
		Slug: "hiroshima-1", Title: "SRE Lounge Hiroshima #1", Date: "2026-10-30",
		ConnpassURL: "https://srelounge.connpass.com/event/1/",
	}}
	now := date(t, "2026-10-27")
	msg := Message(now, []EventDigest{{
		Event: e,
		Items: []Item{
			{Task: task.Task{Title: "会場最終確認", Due: date(t, "2026-10-25")}, DaysLeft: -2},
			{Task: task.Task{Title: "直前リマインド", Due: date(t, "2026-10-27"), Labels: []string{"announce"}}, DaysLeft: 0},
			{Task: task.Task{Title: "配信リハ", Due: date(t, "2026-10-30"), Labels: []string{"streaming"}}, DaysLeft: 3},
		},
	}})

	for _, want := range []string{
		"2026-10-27",
		"SRE Lounge Hiroshima #1",
		"期限超過 2日", "会場最終確認",
		"本日期限", "直前リマインド",
		"あと3日", "配信リハ",
	} {
		if !strings.Contains(msg, want) {
			t.Errorf("message should contain %q:\n%s", want, msg)
		}
	}
	// Only tasks labeled "announce" get an X intent URL
	if strings.Count(msg, "https://x.com/intent/post?text=") != 1 {
		t.Errorf("want exactly 1 intent URL:\n%s", msg)
	}
	if !strings.Contains(msg, url.QueryEscape("SRE Lounge Hiroshima #1")) {
		t.Errorf("intent URL should embed escaped title:\n%s", msg)
	}
	if !strings.Contains(msg, url.QueryEscape("https://srelounge.connpass.com/event/1/")) {
		t.Errorf("intent URL should embed connpass URL:\n%s", msg)
	}
}

func TestXIntentURLWithoutConnpass(t *testing.T) {
	e := &event.Event{Event: event.Meta{Title: "Meetup #1", Date: "2026-10-30"}}
	u := XIntentURL(e)
	if !strings.HasPrefix(u, "https://x.com/intent/post?text=") {
		t.Errorf("unexpected URL %q", u)
	}
	parsed, err := url.Parse(u)
	if err != nil {
		t.Fatal(err)
	}
	text := parsed.Query().Get("text")
	if !strings.Contains(text, "Meetup #1") || !strings.Contains(text, "2026-10-30") {
		t.Errorf("text = %q", text)
	}
}
