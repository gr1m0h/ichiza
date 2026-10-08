// Package dashboard owns the versioned Markdown contract used by an event's
// single GitHub Dashboard Issue.
package dashboard

import "github.com/gr1m0h/ichiza/internal/task"

type Item struct {
	task.Task
	Done           bool
	AssigneeSource string
}

type Document struct {
	Slug  string
	Title string
	Date  string
	Tasks []Item
}
