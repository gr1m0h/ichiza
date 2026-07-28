// Package remind scans events/*/tasks.yaml for tasks that are due soon
// or overdue and renders a notification message.
package remind

import (
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"slices"
	"sort"
	"strings"
	"time"

	"github.com/gr1m0h/ichiza/internal/event"
	"github.com/gr1m0h/ichiza/internal/task"
)

type Options struct {
	EventsDir  string
	Now        time.Time
	WindowDays int // look-ahead: tasks due within this many days
}

type Item struct {
	Task     task.Task
	DaysLeft int // negative = overdue
}

type EventDigest struct {
	Event *event.Event
	Items []Item
}

// Collect walks EventsDir and returns, per event, the undone tasks that
// are overdue or due within WindowDays. A missing EventsDir is not an
// error: a fresh repository simply has nothing to remind about.
func Collect(opt Options) ([]EventDigest, error) {
	entries, err := os.ReadDir(opt.EventsDir)
	if os.IsNotExist(err) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	now := time.Date(opt.Now.Year(), opt.Now.Month(), opt.Now.Day(), 0, 0, 0, 0, time.UTC)

	var out []EventDigest
	for _, ent := range entries {
		if !ent.IsDir() {
			continue
		}
		dir := filepath.Join(opt.EventsDir, ent.Name())
		tasksPath := filepath.Join(dir, "tasks.yaml")
		if _, err := os.Stat(tasksPath); os.IsNotExist(err) {
			continue
		}
		e, err := event.Load(filepath.Join(dir, "event.yaml"))
		if err != nil {
			return nil, fmt.Errorf("event %s: %w", ent.Name(), err)
		}
		tasks, err := task.Load(tasksPath)
		if err != nil {
			return nil, fmt.Errorf("event %s: %w", ent.Name(), err)
		}
		var items []Item
		for _, t := range tasks {
			if t.Done {
				continue
			}
			days := int(t.Due.Sub(now).Hours() / 24)
			if days > opt.WindowDays {
				continue
			}
			items = append(items, Item{Task: t, DaysLeft: days})
		}
		if len(items) == 0 {
			continue
		}
		sort.Slice(items, func(i, j int) bool { return items[i].Task.Due.Before(items[j].Task.Due) })
		out = append(out, EventDigest{Event: e, Items: items})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Event.Event.Date < out[j].Event.Event.Date })
	return out, nil
}

// Message renders the digests as Slack-friendly plain text.
// Tasks labeled "announce" get an X intent URL so the reminder doubles
// as a one-tap SNS post (sns.x.mode: intent).
func Message(now time.Time, digests []EventDigest) string {
	var b strings.Builder
	fmt.Fprintf(&b, "⏰ ichiza remind — %s 時点で期限が近いタスク\n", now.Format("2006-01-02"))
	for _, d := range digests {
		fmt.Fprintf(&b, "\n*%s*（%s / %s 開催）\n", d.Event.Event.Title, d.Event.Event.Slug, d.Event.Event.Date)
		for _, it := range d.Items {
			fmt.Fprintf(&b, "• %s: %s（%s）\n", deadline(it.DaysLeft), it.Task.Title, it.Task.Due.Format("2006-01-02"))
			if slices.Contains(it.Task.Labels, "announce") {
				fmt.Fprintf(&b, "　└ X で告知: %s\n", XIntentURL(d.Event))
			}
		}
	}
	return strings.TrimRight(b.String(), "\n")
}

func deadline(days int) string {
	switch {
	case days < 0:
		return fmt.Sprintf("⚠️ 期限超過 %d日", -days)
	case days == 0:
		return "本日期限"
	default:
		return fmt.Sprintf("あと%d日", days)
	}
}

// XIntentURL builds a pre-filled X (Twitter) post link for the event.
func XIntentURL(e *event.Event) string {
	text := fmt.Sprintf("%s（%s 開催）", e.Event.Title, e.Event.Date)
	if e.Event.ConnpassURL != "" {
		text += "\n" + e.Event.ConnpassURL
	}
	return "https://x.com/intent/post?text=" + url.QueryEscape(text)
}
