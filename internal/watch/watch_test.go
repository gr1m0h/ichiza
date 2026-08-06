package watch

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/gr1m0h/ichiza/internal/event"
)

func date(t *testing.T, s string) time.Time {
	t.Helper()
	d, err := time.Parse("2006-01-02", s)
	if err != nil {
		t.Fatal(err)
	}
	return d
}

func writeEventDir(t *testing.T, eventsDir, slug, title, dateStr, connpass string) {
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
}

// fakeFetcher returns canned stats and records the requested IDs.
type fakeFetcher struct {
	stats map[int]Stats
	got   []int
}

func (f *fakeFetcher) Fetch(ids []int) (map[int]Stats, error) {
	f.got = ids
	return f.stats, nil
}

func intp(n int) *int { return &n }

func TestCollect(t *testing.T) {
	eventsDir := filepath.Join(t.TempDir(), "events")
	writeEventDir(t, eventsDir, "tokyo-3", "Meetup #3", "2026-08-20", "https://example.connpass.com/event/1111/")
	writeEventDir(t, eventsDir, "tokyo-2", "Meetup #2", "2026-05-01", "https://example.connpass.com/event/999/") // past: skipped
	writeEventDir(t, eventsDir, "tokyo-4", "Meetup #4", "2026-09-10", "")                                        // no URL: reported

	f := &fakeFetcher{stats: map[int]Stats{
		1111: {EventID: 1111, Title: "Meetup #3", Accepted: 40, Waiting: 5, Limit: intp(50), OpenStatus: "open"},
	}}
	digests, skipped, err := Collect(Options{EventsDir: eventsDir, Now: date(t, "2026-08-06")}, f)
	if err != nil {
		t.Fatal(err)
	}
	if len(f.got) != 1 || f.got[0] != 1111 {
		t.Errorf("fetched ids = %v, want [1111]", f.got)
	}
	if len(digests) != 1 {
		t.Fatalf("got %d digests, want 1: %+v", len(digests), digests)
	}
	d := digests[0]
	if d.Event.Event.Slug != "tokyo-3" {
		t.Errorf("slug = %q", d.Event.Event.Slug)
	}
	if d.DaysLeft != 14 {
		t.Errorf("DaysLeft = %d, want 14", d.DaysLeft)
	}
	if d.Stats.Accepted != 40 {
		t.Errorf("Accepted = %d, want 40", d.Stats.Accepted)
	}
	if len(skipped) != 1 || skipped[0].Slug != "tokyo-4" {
		t.Errorf("skipped = %+v, want tokyo-4 only", skipped)
	}
}

func TestCollectSlugFilter(t *testing.T) {
	eventsDir := filepath.Join(t.TempDir(), "events")
	// Past events are included when explicitly requested by slug
	writeEventDir(t, eventsDir, "tokyo-2", "Meetup #2", "2026-05-01", "https://example.connpass.com/event/999/")
	writeEventDir(t, eventsDir, "tokyo-3", "Meetup #3", "2026-08-20", "https://example.connpass.com/event/1111/")

	f := &fakeFetcher{stats: map[int]Stats{
		999: {EventID: 999, Accepted: 30, Waiting: 0, OpenStatus: "close"},
	}}
	digests, _, err := Collect(Options{EventsDir: eventsDir, Now: date(t, "2026-08-06"), Slug: "tokyo-2"}, f)
	if err != nil {
		t.Fatal(err)
	}
	if len(digests) != 1 || digests[0].Event.Event.Slug != "tokyo-2" {
		t.Fatalf("digests = %+v, want tokyo-2 only", digests)
	}
	if digests[0].DaysLeft >= 0 {
		t.Errorf("DaysLeft = %d, want negative (past event)", digests[0].DaysLeft)
	}
}

func TestCollectSlugNotFound(t *testing.T) {
	eventsDir := filepath.Join(t.TempDir(), "events")
	writeEventDir(t, eventsDir, "tokyo-3", "Meetup #3", "2026-08-20", "")
	_, _, err := Collect(Options{EventsDir: eventsDir, Now: date(t, "2026-08-06"), Slug: "no-such"}, &fakeFetcher{})
	if err == nil || !strings.Contains(err.Error(), "no-such") {
		t.Errorf("want not-found error, got %v", err)
	}
}

func TestCollectMissingEventsDir(t *testing.T) {
	digests, skipped, err := Collect(Options{
		EventsDir: filepath.Join(t.TempDir(), "no-such-dir"),
		Now:       date(t, "2026-08-06"),
	}, &fakeFetcher{})
	if err != nil {
		t.Fatalf("missing events dir should not error, got %v", err)
	}
	if len(digests) != 0 || len(skipped) != 0 {
		t.Errorf("got %d digests / %d skipped, want 0 / 0", len(digests), len(skipped))
	}
}

func TestCollectUnpublishedEvent(t *testing.T) {
	eventsDir := filepath.Join(t.TempDir(), "events")
	writeEventDir(t, eventsDir, "tokyo-3", "Meetup #3", "2026-08-20", "https://example.connpass.com/event/1111/")
	// API returns nothing for the ID → reported as skipped, not an error
	f := &fakeFetcher{stats: map[int]Stats{}}
	digests, skipped, err := Collect(Options{EventsDir: eventsDir, Now: date(t, "2026-08-06")}, f)
	if err != nil {
		t.Fatal(err)
	}
	if len(digests) != 0 {
		t.Errorf("digests = %+v, want empty", digests)
	}
	if len(skipped) != 1 || skipped[0].Slug != "tokyo-3" {
		t.Errorf("skipped = %+v, want tokyo-3", skipped)
	}
}

func TestNew(t *testing.T) {
	if _, err := New("connpass", "key"); err != nil {
		t.Errorf("connpass adapter: %v", err)
	}
	if _, err := New("connpass", ""); err == nil {
		t.Error("empty API key should error")
	}
	if _, err := New("unknown", "key"); err == nil {
		t.Error("unknown adapter should error")
	}
}

func TestMessage(t *testing.T) {
	e := &event.Event{Event: event.Meta{
		Slug: "tokyo-3", Title: "Meetup #3", Date: "2026-08-20",
	}}
	msg := Message(date(t, "2026-08-06"), []Digest{{
		Event: e,
		Stats: Stats{
			Accepted: 40, Waiting: 5, Limit: intp(50), OpenStatus: "open",
			URL: "https://example.connpass.com/event/1111/",
		},
		DaysLeft: 14,
	}}, []Skipped{{Slug: "tokyo-4", Reason: "connpass_url が未設定"}})

	for _, want := range []string{
		"2026-08-06",
		"Meetup #3", "あと14日",
		"40/50（80%）", "補欠 5", "受付中",
		"https://example.connpass.com/event/1111/",
		"tokyo-4", "connpass_url が未設定",
	} {
		if !strings.Contains(msg, want) {
			t.Errorf("message should contain %q:\n%s", want, msg)
		}
	}
}

func TestMessageNoLimit(t *testing.T) {
	e := &event.Event{Event: event.Meta{Slug: "online-1", Title: "Online #1", Date: "2026-08-06"}}
	msg := Message(date(t, "2026-08-06"), []Digest{{
		Event: e,
		Stats: Stats{Accepted: 120, Waiting: 0, Limit: nil, OpenStatus: "open"},
	}}, nil)
	for _, want := range []string{"120（定員なし）", "本日開催"} {
		if !strings.Contains(msg, want) {
			t.Errorf("message should contain %q:\n%s", want, msg)
		}
	}
}

func TestStatusLabelUnknownPassesThrough(t *testing.T) {
	if got := statusLabel("mystery"); got != "mystery" {
		t.Errorf("statusLabel = %q, want raw pass-through", got)
	}
}
