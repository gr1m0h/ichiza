package remind

import (
	"fmt"
	"net/url"
	"regexp"
	"slices"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/gr1m0h/ichiza/internal/notify"
)

var slackUserID = regexp.MustCompile(`^[UW][A-Z0-9]+$`)

var groupNames = [...]string{"期限超過", "今日期限", "本日確認", "期限間近"}
var groupSymbols = [...]string{"🔴", "🟠", "🔎", "📅"}

func reminderGroup(item Item) int {
	switch {
	case item.DaysLeft < 0:
		return 0
	case item.DaysLeft == 0:
		return 1
	case item.CheckToday:
		return 2
	default:
		return 3
	}
}

// SlackMessages keeps ordinary digests in one post. Large digests continue in
// another post with the event heading repeated, without dropping any tasks.
// Slack permits 50 blocks per message; text is also kept below its 40k limit.
func SlackMessages(now time.Time, digests []EventDigest, users map[string]string) []notify.SlackMessage {
	var messages []notify.SlackMessage
	var current []EventDigest
	flush := func() {
		if len(current) == 0 {
			return
		}
		message := slackMessage(now, current, users)
		message.Text = clipSlackText(message.Text, 28000)
		messages = append(messages, message)
		current = nil
	}
	for _, digest := range digests {
		for _, item := range digest.Items {
			candidate := appendDigestItem(current, digest, item)
			message := slackMessage(now, candidate, users)
			if len(current) > 0 && (len(message.Blocks) > 50 || utf8.RuneCountInString(message.Text) > 28000) {
				flush()
				candidate = appendDigestItem(nil, digest, item)
			}
			current = candidate
		}
	}
	flush()
	return messages
}

func appendDigestItem(current []EventDigest, digest EventDigest, item Item) []EventDigest {
	next := slices.Clone(current)
	if len(next) > 0 && next[len(next)-1].Event.Event.Slug == digest.Event.Event.Slug {
		last := &next[len(next)-1]
		last.Items = append(slices.Clone(last.Items), item)
	} else {
		digest.Items = []Item{item}
		next = append(next, digest)
	}
	return next
}

func plainText(value string) *notify.SlackText {
	return &notify.SlackText{Type: "plain_text", Text: value}
}

func slackMessage(now time.Time, digests []EventDigest, users map[string]string) notify.SlackMessage {
	counts := [4]int{}
	for _, digest := range digests {
		for _, item := range digest.Items {
			counts[reminderGroup(item)]++
		}
	}
	var summary []string
	for group, count := range counts {
		if count > 0 {
			summary = append(summary, fmt.Sprintf("%s %d件", groupNames[group], count))
		}
	}
	message := notify.SlackMessage{
		// Screen readers and notifications receive complete, readable task text;
		// mentions are emitted only in the explicitly configured block fields.
		Text: Message(now, digests, nil),
		Blocks: []notify.SlackBlock{
			{Type: "header", Text: plainText("ichiza｜タスクリマインド")},
			{Type: "context", Elements: []notify.SlackText{{Type: "plain_text", Text: now.Format(time.DateOnly) + " · " + strings.Join(summary, " · ")}}},
		},
	}
	for _, digest := range digests {
		context := []notify.SlackText{{Type: "plain_text", Text: digest.Event.Event.Date + " 開催"}}
		if validSlackURL(digest.IssueURL) {
			context = append(context, notify.SlackText{Type: "mrkdwn", Text: "<" + escapeSlack(digest.IssueURL) + "|Event Hubを開く>", Verbatim: true})
		}
		message.Blocks = append(message.Blocks,
			notify.SlackBlock{Type: "divider"},
			notify.SlackBlock{Type: "header", Text: plainText(clipSlackText(digest.Event.Event.Title, 150))},
			notify.SlackBlock{Type: "context", Elements: context},
		)
		for group := range groupNames {
			var items []Item
			for _, item := range digest.Items {
				if reminderGroup(item) == group {
					items = append(items, item)
				}
			}
			if len(items) == 0 {
				continue
			}
			message.Blocks = append(message.Blocks, notify.SlackBlock{Type: "section", Text: &notify.SlackText{
				Type: "mrkdwn", Text: fmt.Sprintf("%s *%s · %d件*", groupSymbols[group], groupNames[group], len(items)), Verbatim: true,
			}})
			for _, item := range items {
				status := fmt.Sprintf("*%s*\n期日 %s", deadline(item.DaysLeft), item.Task.Due.Format(time.DateOnly))
				if item.CheckToday {
					status += "\n本日確認"
				}
				message.Blocks = append(message.Blocks, notify.SlackBlock{
					Type: "section", Text: plainText(clipSlackText(item.Task.Title, 3000)),
					Fields: []notify.SlackText{
						{Type: "mrkdwn", Text: status, Verbatim: true},
						{Type: "mrkdwn", Text: "*担当者*\n" + slackOwners(item, users), Verbatim: true},
					},
				})
				if slices.Contains(item.Task.Labels, "announce") {
					if link := XIntentURL(digest.Event); validSlackURL(link) {
						message.Blocks = append(message.Blocks, notify.SlackBlock{Type: "context", Elements: []notify.SlackText{
							{Type: "mrkdwn", Text: "<" + escapeSlack(link) + "|Xで告知する>", Verbatim: true},
						}})
					}
				}
			}
		}
	}
	return message
}

func slackOwners(item Item, users map[string]string) string {
	if len(item.Assignees) == 0 {
		return "未割り当て"
	}
	var owners []string
	length := 0
	for _, owner := range item.Assignees {
		value := escapeSlack(owner)
		if id := users[owner]; item.MentionAssignees && slackUserID.MatchString(id) {
			value = "<@" + id + ">"
		}
		if length+utf8.RuneCountInString(value)+3 > 1850 {
			owners = append(owners, "…")
			break
		}
		owners = append(owners, value)
		length += utf8.RuneCountInString(value) + 3
	}
	return strings.Join(owners, " · ")
}

func escapeSlack(value string) string {
	return strings.NewReplacer("&", "&amp;", "<", "&lt;", ">", "&gt;").Replace(value)
}

func validSlackURL(value string) bool {
	if len(value) > 1800 || strings.ContainsAny(value, "<>|\r\n") {
		return false
	}
	parsed, err := url.Parse(value)
	return err == nil && parsed.Scheme == "https" && parsed.Host != "" && parsed.User == nil
}

func clipSlackText(value string, limit int) string {
	runes := []rune(strings.TrimSpace(value))
	if len(runes) == 0 {
		return "—"
	}
	if len(runes) <= limit {
		return string(runes)
	}
	return string(runes[:limit-1]) + "…"
}
