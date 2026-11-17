package remind

import (
	"encoding/json"
	"fmt"
	"strings"
	"testing"
	"unicode/utf8"

	"github.com/gr1m0h/ichiza/internal/event"
	"github.com/gr1m0h/ichiza/internal/task"
)

func TestSlackMessagesSeparatesDeadlinesAndPreservesMentionPreferences(t *testing.T) {
	e := &event.Event{Event: event.Meta{Slug: "hiroshima-3", Title: "【JAWS-UG広島支部共催】SRE Lounge Hiroshima #3", Date: "2026-12-12"}}
	digest := EventDigest{Event: e, IssueURL: "https://github.example/operations/issues/42", Items: []Item{
		{Task: task.Task{Title: "Future", Due: date(t, "2026-11-20")}, DaysLeft: 5, Assignees: []string{"bob"}},
		{Task: task.Task{Title: "Overdue <!channel> *literal*", Due: date(t, "2026-11-12")}, DaysLeft: -3, Assignees: []string{"alice", "bob"}, MentionAssignees: true, CheckToday: true},
		{Task: task.Task{Title: "Today", Due: date(t, "2026-11-15"), Labels: []string{"announce"}}, DaysLeft: 0},
		{Task: task.Task{Title: "Check", Due: date(t, "2026-12-01")}, DaysLeft: 16, CheckToday: true},
	}}
	messages := SlackMessages(date(t, "2026-11-15"), []EventDigest{digest}, map[string]string{"alice": "U123", "bob": "U456"})
	if len(messages) != 1 {
		t.Fatalf("got %d messages, want one digest", len(messages))
	}
	message := messages[0]
	if strings.Contains(message.Text, "<@") || !strings.Contains(message.Text, "期限超過 3日") || !strings.Contains(message.Text, "本日確認") {
		t.Fatalf("unreadable or mentioning notification fallback: %s", message.Text)
	}
	var titles []string
	var owners []string
	var links []string
	var overdueStatus string
	for _, block := range message.Blocks {
		if block.Type == "section" && len(block.Fields) > 0 {
			if block.Text.Type != "plain_text" {
				t.Fatalf("user task title must not be interpreted as mrkdwn: %+v", block.Text)
			}
			titles = append(titles, block.Text.Text)
			owners = append(owners, block.Fields[1].Text)
			if strings.HasPrefix(block.Text.Text, "Overdue") {
				overdueStatus = block.Fields[0].Text
			}
		}
		for _, element := range block.Elements {
			links = append(links, element.Text)
		}
	}
	if got := strings.Join(titles, "|"); got != "Overdue <!channel> *literal*|Today|Check|Future" {
		t.Fatalf("urgency ordering or title text lost: %s", got)
	}
	for _, want := range []string{"期限超過 3日", "2026-11-12", "本日確認"} {
		if !strings.Contains(overdueStatus, want) {
			t.Errorf("check-date reminder hid actual deadline: %q", overdueStatus)
		}
	}
	if !strings.Contains(owners[0], "<@U123> · <@U456>") || strings.Contains(owners[3], "<@") || !strings.Contains(owners[1], "未割り当て") {
		t.Fatalf("mention preference/unassigned state lost: %+v", owners)
	}
	joinedLinks := strings.Join(links, "\n")
	if !strings.Contains(joinedLinks, "https://github.example/operations/issues/42|Event Hubを開く") || !strings.Contains(joinedLinks, "https://x.com/intent/post?") {
		t.Fatalf("navigation links lost: %s", joinedLinks)
	}
}

func TestSlackMessagesKeepsSmallEventsTogetherAndSplitsLargeDigestsWithoutLosingTasks(t *testing.T) {
	a := &event.Event{Event: event.Meta{Slug: "a", Title: "Event A", Date: "2026-12-12"}}
	b := &event.Event{Event: event.Meta{Slug: "b", Title: "Event B", Date: "2026-12-13"}}
	item := Item{Task: task.Task{Title: "One", Due: date(t, "2026-11-12")}, DaysLeft: -3}
	if messages := SlackMessages(date(t, "2026-11-15"), []EventDigest{{Event: a, Items: []Item{item}}, {Event: b, Items: []Item{item}}}, nil); len(messages) != 1 {
		t.Fatalf("small events generated %d messages", len(messages))
	}
	var items []Item
	for i := range 110 {
		next := item
		next.Task.Title = fmt.Sprintf("Task %03d %s", i, strings.Repeat("準備", 450))
		if i%2 == 0 {
			next.Task.Labels = []string{"announce"}
		}
		items = append(items, next)
	}
	before, _ := json.Marshal(items)
	messages := SlackMessages(date(t, "2026-11-15"), []EventDigest{{Event: a, Items: items}}, nil)
	if len(messages) < 2 {
		t.Fatal("large digest was not split")
	}
	seen := map[string]int{}
	for _, message := range messages {
		if len(message.Blocks) > 50 || utf8.RuneCountInString(message.Text) > 28000 {
			t.Fatalf("Slack payload limits exceeded: %d blocks, %d chars", len(message.Blocks), utf8.RuneCountInString(message.Text))
		}
		if !strings.Contains(message.Text, "Event A") {
			t.Fatal("continuation lost event context")
		}
		for _, block := range message.Blocks {
			if block.Type == "section" && len(block.Fields) > 0 {
				seen[block.Text.Text]++
			}
		}
	}
	for _, item := range items {
		if seen[item.Task.Title] != 1 {
			t.Fatalf("task missing or repeated: %s (%d)", item.Task.Title[:8], seen[item.Task.Title])
		}
	}
	after, _ := json.Marshal(items)
	if string(before) != string(after) {
		t.Fatal("rendering mutated input tasks")
	}
}

func TestSlackMessagesBoundsLongTextAndRejectsInjectedLinksAndMentions(t *testing.T) {
	e := &event.Event{Event: event.Meta{Slug: "long", Title: strings.Repeat("イ", 200), Date: "2026-12-12"}}
	item := Item{Task: task.Task{Title: strings.Repeat("タ", 3500), Due: date(t, "2026-11-12")}, DaysLeft: -3,
		Assignees: []string{"<!channel>", "bad-id"}, MentionAssignees: true}
	messages := SlackMessages(date(t, "2026-11-15"), []EventDigest{{Event: e, Items: []Item{item}, IssueURL: "https://github.example/|<!channel>"}}, map[string]string{"bad-id": "U123> <!channel>"})
	for _, block := range messages[0].Blocks {
		if block.Type == "header" && utf8.RuneCountInString(block.Text.Text) > 150 {
			t.Fatal("header exceeds Slack's limit")
		}
		if block.Type == "section" && utf8.RuneCountInString(block.Text.Text) > 3000 {
			t.Fatal("section exceeds Slack's limit")
		}
		for _, field := range block.Fields {
			if utf8.RuneCountInString(field.Text) > 2000 || strings.Contains(field.Text, "<!channel>") || strings.Contains(field.Text, "<@U123") {
				t.Fatalf("unsafe or oversized field: %s", field.Text)
			}
		}
		for _, element := range block.Elements {
			if strings.Contains(element.Text, "github.example") {
				t.Fatal("invalid link was emitted")
			}
		}
	}
	if len(SlackMessages(date(t, "2026-11-15"), nil, nil)) != 0 {
		t.Fatal("empty digests should not send a notification")
	}
}
