// Package dashboard owns the versioned Markdown contract used by an event's
// single GitHub Dashboard Issue.
package dashboard

import "github.com/gr1m0h/ichiza/internal/task"

type Activity struct {
	At   string `json:"at"`
	Done bool   `json:"done"`
}

type Item struct {
	task.Task
	Done             bool
	AssigneeSource   string
	Assignees        []string
	MentionAssignees bool
	Reminder         string // empty for deadline reminders, "off", or a local YYYY-MM-DD
	TaskSource       string
	Deleted          bool
	CreatedAt        string
	CompletedAt      string
	History          []Activity
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
