package remind

import (
	"encoding/json"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/gr1m0h/ichiza/internal/dashboard"
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
		{ID: "overdue", Title: "期限超過タスク", Due: date(t, "2026-10-25")},
		{ID: "today", Title: "本日期限タスク", Due: date(t, "2026-10-27")},
		{ID: "soon", Title: "期限内タスク", Due: date(t, "2026-10-30")},
		{ID: "later", Title: "期限外タスク", Due: date(t, "2026-11-10")},
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

func TestCollectAllClosed(t *testing.T) {
	eventsDir := filepath.Join(t.TempDir(), "events")
	writeEventDir(t, eventsDir, "done-1", "Done", "2026-10-30", "", []task.Task{
		{ID: "done", Title: "済", Due: date(t, "2026-10-28")},
	})
	digests, err := Collect(Options{
		EventsDir: eventsDir, Now: date(t, "2026-10-27"), WindowDays: 7,
		TaskStates: map[string]TaskState{taskKey("done-1", "done"): {Done: true}},
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(digests) != 0 {
		t.Errorf("got %d digests, want 0", len(digests))
	}
}

func TestCollectSkipsCheckedDashboardTasks(t *testing.T) {
	eventsDir := t.TempDir()
	writeEventDir(t, eventsDir, "hiroshima-1", "SRE Lounge Hiroshima #1", "2026-10-30", "", []task.Task{
		{ID: "venue", Title: "会場最終確認", Due: date(t, "2026-10-25")},
		{ID: "announce", Title: "直前リマインド", Due: date(t, "2026-10-27")},
	})
	digests, err := Collect(Options{
		EventsDir: eventsDir, Now: date(t, "2026-10-27"), WindowDays: 7,
		TaskStates: map[string]TaskState{taskKey("hiroshima-1", "venue"): {Done: true}},
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(digests) != 1 || len(digests[0].Items) != 1 {
		t.Fatalf("got %+v, want 1 digest with 1 item", digests)
	}
	if got := digests[0].Items[0].Task.ID; got != "announce" {
		t.Errorf("remaining task id = %q, want announce", got)
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
			{Task: task.Task{Title: "会場最終確認", Due: date(t, "2026-10-25")}, Assignees: []string{"alice"}, DaysLeft: -2},
			{Task: task.Task{Title: "直前リマインド", Due: date(t, "2026-10-27"), Labels: []string{"announce"}}, DaysLeft: 0},
			{Task: task.Task{Title: "配信リハ", Due: date(t, "2026-10-30"), Labels: []string{"streaming"}}, DaysLeft: 3},
		},
	}}, map[string]string{"alice": "U012ABC"})

	for _, want := range []string{
		"2026-10-27",
		"SRE Lounge Hiroshima #1",
		"期限超過 2日", "会場最終確認",
		"担当: alice",
		"本日期限", "直前リマインド",
		"あと3日", "配信リハ",
	} {
		if !strings.Contains(msg, want) {
			t.Errorf("message should contain %q:\n%s", want, msg)
		}
	}
	if strings.Contains(msg, "<@") {
		t.Fatalf("default reminder mentioned an assignee: %s", msg)
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

// Exercise the issue format written by the Web editor through sync and the reminder digest.
func TestWebReminderAfterDashboardSync(t *testing.T) {
	tasks := []task.Task{
		{ID: "venue", Title: "Venue", Due: date(t, "2026-12-01"), Assignee: "original"},
		{ID: "mute", Title: "Muted", Due: date(t, "2026-11-01")},
		{ID: "done", Title: "Done", Due: date(t, "2026-11-01")},
	}
	doc := dashboard.Document{Slug: "meetup", Title: "Meetup", Date: "2026-12-12"}
	for _, item := range tasks {
		doc.Tasks = append(doc.Tasks, dashboard.Item{Task: item})
	}
	const body = `<!-- ichiza-dashboard:v1 slug=meetup date=2026-12-12 -->
# Meetup
<!-- ichiza-tasks:start -->
- [ ] **2026-12-01** Venue · @alice @bob <!-- ichiza-task:{"id":"venue","due":"2026-12-01","assignees":["alice","bob"],"assignee_source":"runtime","mention_assignees":true,"reminder":"2026-11-16"} -->
- [ ] **2026-11-01** Muted <!-- ichiza-task:{"id":"mute","due":"2026-11-01","reminder":"off"} -->
- [x] **2026-11-01** Done <!-- ichiza-task:{"id":"done","due":"2026-11-01","reminder":"2026-11-16"} -->
<!-- ichiza-tasks:end -->`
	merged, err := dashboard.Merge(body, doc)
	if err != nil {
		t.Fatal(err)
	}
	issues, err := json.Marshal([]map[string]string{{"body": merged, "url": "https://github.example/operations/issues/42"}})
	if err != nil {
		t.Fatal(err)
	}
	states, err := parseDashboardTasks(issues)
	if err != nil {
		t.Fatal(err)
	}
	dir := t.TempDir()
	writeEventDir(t, dir, "meetup", "Meetup", "2026-12-12", "", tasks)
	for _, day := range []string{"2026-11-15", "2026-11-16", "2026-11-17"} {
		now := date(t, day)
		digests, err := Collect(Options{EventsDir: dir, Now: now, WindowDays: 7, TaskStates: states})
		if err != nil {
			t.Fatal(err)
		}
		if day != "2026-11-16" {
			if len(digests) != 0 {
				t.Fatalf("%s: unexpected digest %+v", day, digests)
			}
			continue
		}
		if len(digests) != 1 || len(digests[0].Items) != 1 || digests[0].Items[0].Task.ID != "venue" {
			t.Fatalf("unexpected check date digest: %+v", digests)
		}
		if digests[0].IssueURL != "https://github.example/operations/issues/42" {
			t.Fatalf("source Issue URL was lost: %q", digests[0].IssueURL)
		}
		msg := Message(now, digests, map[string]string{"alice": "U123", "bob": "U456"})
		for _, want := range []string{"本日確認", "<@U123>", "<@U456>"} {
			if !strings.Contains(msg, want) {
				t.Fatalf("missing %s: %s", want, msg)
			}
		}
	}
}

// This fixture follows the Web writer's metadata contract, including the
// deletion tombstone. Exercise sync and reminders together so neither can
// silently resurrect removed work or drop Web-created tasks and history.
func TestWebTaskLifecycleSurvivesSyncAndReminders(t *testing.T) {
	current := `<!-- ichiza-dashboard:v1 slug=web-event date=2026-11-01 -->
# Web event
<!-- ichiza-tasks:start -->
<!-- ichiza-deleted-task:removed -->
- [ ] **2026-10-27** 配信テスト · @alice @bob <!-- ichiza-task:{"id":"web-added","due":"2026-10-27","labels":[],"task_source":"runtime","created_at":"2026-10-25T00:00:00.000Z","assignees":["alice","bob"],"assignee_source":"runtime","history":[{"at":"2026-10-26T00:00:00.000Z","done":true},{"at":"2026-10-27T00:00:00.000Z","done":false}]} -->
- [x] **2026-10-26** 完了タスク <!-- ichiza-task:{"id":"done","due":"2026-10-26","completed_at":"2026-10-26T01:00:00.000Z","history":[{"at":"2026-10-26T01:00:00.000Z","done":true}]} -->
<!-- ichiza-tasks:end -->
## Notes
運営メモ
`
	desired := dashboard.Document{Slug: "web-event", Title: "Web event", Date: "2026-11-01", Tasks: []dashboard.Item{
		{Task: task.Task{ID: "removed", Title: "復活させない", Due: date(t, "2026-10-25")}},
		{Task: task.Task{ID: "done", Title: "完了タスク", Due: date(t, "2026-10-26")}},
	}}
	for range 2 {
		var err error
		current, err = dashboard.Merge(current, desired)
		if err != nil {
			t.Fatal(err)
		}
	}
	parsed, err := dashboard.Parse(current)
	if err != nil {
		t.Fatal(err)
	}
	if len(parsed.Tasks) != 3 || !parsed.Tasks[0].Deleted || !parsed.Tasks[1].Done || parsed.Tasks[1].CompletedAt != "2026-10-26T01:00:00.000Z" || len(parsed.Tasks[1].History) != 1 || parsed.Tasks[2].TaskSource != "runtime" || len(parsed.Tasks[2].History) != 2 {
		t.Fatalf("sync lost lifecycle state: %+v", parsed.Tasks)
	}
	if !strings.Contains(current, "運営メモ") {
		t.Fatal("sync lost notes")
	}
	payload, err := json.Marshal([]map[string]string{{"body": current, "url": "https://example.test/42"}})
	if err != nil {
		t.Fatal(err)
	}
	states, err := parseDashboardTasks(payload)
	if err != nil {
		t.Fatal(err)
	}
	eventsDir := t.TempDir()
	writeEventDir(t, eventsDir, "web-event", "Web event", "2026-11-01", "", []task.Task{desired.Tasks[0].Task, desired.Tasks[1].Task})
	digests, err := Collect(Options{EventsDir: eventsDir, Now: date(t, "2026-10-27"), WindowDays: 7, TaskStates: states})
	if err != nil {
		t.Fatal(err)
	}
	if len(digests) != 1 || len(digests[0].Items) != 1 || digests[0].Items[0].Task.ID != "web-added" || strings.Join(digests[0].Items[0].Assignees, ",") != "alice,bob" {
		t.Fatalf("wrong reminder tasks after sync: %+v", digests)
	}
	// A runtime ID that later appears in YAML keeps the Web definition and is
	// emitted once, rather than generating duplicate notifications.
	writeEventDir(t, eventsDir, "web-event", "Web event", "2026-11-01", "", []task.Task{{ID: "web-added", Title: "古い定義", Due: date(t, "2026-12-31")}})
	digests, err = Collect(Options{EventsDir: eventsDir, Now: date(t, "2026-10-27"), WindowDays: 7, TaskStates: states})
	if err != nil || len(digests) != 1 || len(digests[0].Items) != 1 || digests[0].Items[0].Task.Title != "配信テスト" {
		t.Fatalf("runtime collision: %+v, %v", digests, err)
	}
}
