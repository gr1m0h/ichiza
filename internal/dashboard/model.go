// Package dashboard owns the versioned Markdown contract used by an event's
// single GitHub Dashboard Issue.
package dashboard

import "github.com/gr1m0h/ichiza/internal/task"

type Item struct {
	task.Task
	Done             bool
	AssigneeSource   string
	Assignees        []string
	MentionAssignees bool
	Reminder         string // empty for deadline reminders, "off", or a local YYYY-MM-DD
}

func (item Item) CurrentAssignees() []string {
	if item.Assignee != "" {
		return []string{item.Assignee}
	}
	return item.Assignees
}

type Document struct {
	Slug  string
	Title string
	Date  string
	Tasks []Item
}
