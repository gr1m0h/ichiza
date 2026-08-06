// Closed-issue lookup: GitHub Issues own completion state, so closing
// the issue is all the operator has to do. tasks.yaml stays a pure
// definition of what is due when.
package remind

import (
	"encoding/json"
	"fmt"
	"os/exec"
	"regexp"
)

// execCommand is swapped in tests so ClosedIssues can run without gh.
var execCommand = exec.Command

// Issue metadata written by scaffold: the title carries a 【〜MM/DD】 prefix,
// the body carries machine-readable "event: `slug`" / "due: YYYY-MM-DD" lines.
// \r? tolerates bodies rewritten to CRLF by the GitHub web editor.
var (
	titlePrefix = regexp.MustCompile(`^【〜\d{2}/\d{2}】`)
	bodySlug    = regexp.MustCompile("(?m)^event: `([a-z0-9][a-z0-9-]*)`\r?$")
	bodyDue     = regexp.MustCompile(`(?m)^due: (\d{4}-\d{2}-\d{2})\r?$`)
)

// taskKey identifies a task across tasks.yaml and its GitHub issue.
func taskKey(slug, due, title string) string {
	return slug + "\x00" + due + "\x00" + title
}

// ClosedIssues returns the task keys of closed issues in the current
// repository via the gh CLI. Issues without scaffold's metadata (created
// by hand, or retitled) are ignored. Callers should degrade to
// tasks.yaml-only judgement when this errors (no gh, no auth, offline).
func ClosedIssues() (map[string]bool, error) {
	out, err := execCommand("gh", "issue", "list",
		"--state", "closed", "--limit", "500", "--json", "title,body").Output()
	if err != nil {
		return nil, fmt.Errorf("gh issue list: %w", err)
	}
	return parseClosedIssues(out)
}

func parseClosedIssues(out []byte) (map[string]bool, error) {
	var issues []struct {
		Title string `json:"title"`
		Body  string `json:"body"`
	}
	if err := json.Unmarshal(out, &issues); err != nil {
		return nil, fmt.Errorf("parse gh issue list output: %w", err)
	}
	closed := make(map[string]bool, len(issues))
	for _, is := range issues {
		slug := bodySlug.FindStringSubmatch(is.Body)
		due := bodyDue.FindStringSubmatch(is.Body)
		if slug == nil || due == nil {
			continue // not an ichiza-generated issue
		}
		title := titlePrefix.ReplaceAllString(is.Title, "")
		closed[taskKey(slug[1], due[1], title)] = true
	}
	return closed, nil
}
