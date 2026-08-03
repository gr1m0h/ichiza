// Package speaker collects speaker info from GitHub Issue Forms and
// renders the connpass listing section.
package speaker

import (
	"encoding/json"
	"fmt"
	"os/exec"
	"strings"

	"github.com/gr1m0h/ichiza/internal/event"
)

type Issue struct {
	Title string `json:"title"`
	URL   string `json:"url"`
	Body  string `json:"body"`
}

// Fetch lists open issues with the given label via the gh CLI —
// same zero-token-plumbing approach as scaffold's issue creation.
func Fetch(label string) ([]Issue, error) {
	out, err := exec.Command("gh", "issue", "list",
		"--label", label, "--state", "open",
		"--json", "title,url,body").Output()
	if err != nil {
		return nil, fmt.Errorf("gh issue list: %w", err)
	}
	var issues []Issue
	if err := json.Unmarshal(out, &issues); err != nil {
		return nil, fmt.Errorf("parse gh output: %w", err)
	}
	return issues, nil
}

// Parse extracts a Speaker from the markdown body GitHub renders for an
// Issue Form submission ("### <label>\n\n<value>" sections). Headings are
// matched by keyword so cosmetic edits to the form don't break parsing.
func Parse(body string) event.Speaker {
	var s event.Speaker
	for heading, value := range sections(body) {
		switch {
		case strings.Contains(heading, "お名前"):
			s.Handle = value
		case strings.Contains(heading, "SNS"):
			s.SNS = value
		case strings.Contains(heading, "経歴"), strings.Contains(heading, "プロフィール"):
			s.Bio = value
		case strings.Contains(heading, "セッションタイトル"):
			s.SessionTitle = value
		case strings.Contains(heading, "登壇形態"):
			s.Remote = strings.Contains(value, "[x]")
		}
	}
	return s
}

func sections(body string) map[string]string {
	out := map[string]string{}
	var heading string
	var lines []string
	flush := func() {
		if heading == "" {
			return
		}
		v := strings.TrimSpace(strings.Join(lines, "\n"))
		if v == "_No response_" {
			v = ""
		}
		out[heading] = v
	}
	for _, line := range strings.Split(body, "\n") {
		if h, ok := strings.CutPrefix(line, "### "); ok {
			flush()
			heading, lines = strings.TrimSpace(h), nil
			continue
		}
		lines = append(lines, line)
	}
	flush()
	return out
}

// Connpass renders the "## 登壇者" speakers section for the connpass event page.
func Connpass(speakers []event.Speaker) string {
	var b strings.Builder
	b.WriteString("## 登壇者\n")
	for _, s := range speakers {
		title := s.SessionTitle
		if title == "" {
			title = "タイトル未定"
		}
		fmt.Fprintf(&b, "\n### %s\n\n", title)
		name := s.Handle
		if s.Remote {
			name += "（リモート登壇）"
		}
		b.WriteString(name + "\n")
		if s.SNS != "" {
			b.WriteString(s.SNS + "\n")
		}
		if s.Bio != "" {
			b.WriteString("\n" + s.Bio + "\n")
		}
	}
	return b.String()
}
