// Package watch tracks registration counts for published events.
// The registration service is an adapter (registry.type in ichiza.yaml,
// currently connpass only) so other services can be added without
// touching this package.
package watch

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/gr1m0h/ichiza/internal/event"
)

// Stats is a service-neutral snapshot of one event's registration state.
type Stats struct {
	EventID    int
	Title      string
	URL        string
	Limit      *int // nil = no capacity cap
	Accepted   int
	Waiting    int
	OpenStatus string // preopen | open | close | cancelled (connpass values)
}

// Fetcher retrieves registration stats for the given service-side event IDs.
type Fetcher interface {
	Fetch(ids []int) (map[int]Stats, error)
}

// New returns the Fetcher for the configured registry adapter.
func New(adapterType, apiKey string) (Fetcher, error) {
	switch adapterType {
	case "connpass":
		if apiKey == "" {
			return nil, fmt.Errorf("watch: connpass adapter requires CONNPASS_API_KEY")
		}
		return NewConnpass(apiKey), nil
	}
	return nil, fmt.Errorf("watch: unsupported registry adapter %q", adapterType)
}

type Options struct {
	EventsDir string
	Now       time.Time
	Slug      string // non-empty = watch only this event
}

// Digest pairs an event definition with its live registration stats.
type Digest struct {
	Event    *event.Event
	Stats    Stats
	DaysLeft int // days until the event (negative = already held)
}

// Skipped records an event that could not be watched and why, so the
// operator sees the gap instead of a silently shorter report.
type Skipped struct {
	Slug   string
	Reason string
}

// Collect walks EventsDir, picks upcoming events that have a connpass_url,
// and fetches their registration stats in one adapter call. Past events
// are skipped unless explicitly requested via Slug.
func Collect(opt Options, f Fetcher) ([]Digest, []Skipped, error) {
	entries, err := os.ReadDir(opt.EventsDir)
	if os.IsNotExist(err) {
		return nil, nil, nil
	}
	if err != nil {
		return nil, nil, err
	}
	today := time.Date(opt.Now.Year(), opt.Now.Month(), opt.Now.Day(), 0, 0, 0, 0, time.UTC)

	type target struct {
		event *event.Event
		id    int
		days  int
	}
	var targets []target
	var skipped []Skipped
	found := false
	for _, ent := range entries {
		if !ent.IsDir() {
			continue
		}
		if opt.Slug != "" && ent.Name() != opt.Slug {
			continue
		}
		found = true
		e, err := event.Load(filepath.Join(opt.EventsDir, ent.Name(), "event.yaml"))
		if err != nil {
			return nil, nil, fmt.Errorf("event %s: %w", ent.Name(), err)
		}
		date, err := e.Event.DateTime()
		if err != nil {
			return nil, nil, fmt.Errorf("event %s: %w", ent.Name(), err)
		}
		days := int(date.Sub(today).Hours() / 24)
		if days < 0 && opt.Slug == "" {
			continue // already held
		}
		if e.Event.ConnpassURL == "" {
			skipped = append(skipped, Skipped{Slug: ent.Name(), Reason: "connpass_url が未設定（募集ページ公開後に event.yaml へ追記）"})
			continue
		}
		id, err := EventIDFromURL(e.Event.ConnpassURL)
		if err != nil {
			return nil, nil, fmt.Errorf("event %s: %w", ent.Name(), err)
		}
		targets = append(targets, target{event: e, id: id, days: days})
	}
	if opt.Slug != "" && !found {
		return nil, nil, fmt.Errorf("event %q not found in %s", opt.Slug, opt.EventsDir)
	}
	if len(targets) == 0 {
		return nil, skipped, nil
	}

	ids := make([]int, len(targets))
	for i, t := range targets {
		ids[i] = t.id
	}
	stats, err := f.Fetch(ids)
	if err != nil {
		return nil, nil, err
	}

	var out []Digest
	for _, t := range targets {
		s, ok := stats[t.id]
		if !ok {
			skipped = append(skipped, Skipped{
				Slug:   t.event.Event.Slug,
				Reason: fmt.Sprintf("connpass API がイベント %d を返しませんでした（非公開または下書き？）", t.id),
			})
			continue
		}
		out = append(out, Digest{Event: t.event, Stats: s, DaysLeft: t.days})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Event.Event.Date < out[j].Event.Event.Date })
	return out, skipped, nil
}

// Message renders the digests as Slack-friendly plain text.
func Message(now time.Time, digests []Digest, skipped []Skipped) string {
	var b strings.Builder
	fmt.Fprintf(&b, "📊 ichiza watch — %s 時点の申込状況\n", now.Format("2006-01-02"))
	for _, d := range digests {
		fmt.Fprintf(&b, "\n*%s*（%s / %s 開催・%s）\n", d.Event.Event.Title, d.Event.Event.Slug, d.Event.Event.Date, countdown(d.DaysLeft))
		fmt.Fprintf(&b, "• 申込 %s / 補欠 %d / %s\n", acceptedLabel(d.Stats), d.Stats.Waiting, statusLabel(d.Stats.OpenStatus))
		fmt.Fprintf(&b, "　└ %s\n", d.Stats.URL)
	}
	for _, s := range skipped {
		fmt.Fprintf(&b, "\n⚠️ %s: %s\n", s.Slug, s.Reason)
	}
	return strings.TrimRight(b.String(), "\n")
}

func acceptedLabel(s Stats) string {
	if s.Limit == nil {
		return fmt.Sprintf("%d（定員なし）", s.Accepted)
	}
	label := fmt.Sprintf("%d/%d", s.Accepted, *s.Limit)
	if *s.Limit > 0 {
		label += fmt.Sprintf("（%d%%）", s.Accepted*100 / *s.Limit)
	}
	return label
}

func countdown(days int) string {
	switch {
	case days < 0:
		return fmt.Sprintf("%d日前に開催済み", -days)
	case days == 0:
		return "本日開催"
	default:
		return fmt.Sprintf("あと%d日", days)
	}
}

// statusLabel maps connpass open_status to a human label; unknown values
// pass through raw so new statuses degrade visibly instead of silently.
func statusLabel(status string) string {
	switch status {
	case "preopen":
		return "受付前"
	case "open":
		return "受付中"
	case "close":
		return "受付終了"
	case "cancelled":
		return "中止"
	default:
		return status
	}
}
