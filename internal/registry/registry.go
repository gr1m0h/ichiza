// Package registry renders the event registration page draft (connpass 等)
// from event.yaml and user-editable markdown templates. connpass has no
// write API, so the goal is to make the human's job "copy the previous
// event on connpass, paste this draft, publish" — zero manual editing.
package registry

import (
	"embed"
	"fmt"
	"os"
	"strings"
	"text/template"

	"github.com/gr1m0h/ichiza/internal/event"
)

//go:embed templates/page.md templates/speaker.md
var defaults embed.FS

// PageData is the variable set exposed to page templates.
type PageData struct {
	Title       string
	Slug        string
	Date        string // YYYY-MM-DD
	DateJP      string // 2026年11月28日（土）; falls back to Date when unparseable
	Mode        string
	ConnpassURL string
	Venue       *event.Venue
	Streaming   *event.Streaming
	Timetable   []event.Slot

	// Pre-rendered blocks so templates don't need loops.
	TimetableTable  string // markdown table (empty when no timetable)
	SpeakersSection string // speaker template applied to each speaker

	Speakers []SpeakerData
}

// SpeakerData is the variable set exposed to speaker templates.
type SpeakerData struct {
	Handle       string
	SNS          string
	Bio          string
	SessionTitle string
	Remote       bool

	DisplayName         string // Handle +（リモート登壇）
	DisplaySessionTitle string // SessionTitle or タイトル未定
}

// RenderPage renders the full page draft. Empty paths fall back to the
// embedded default templates.
func RenderPage(e *event.Event, pagePath, speakerPath string) (string, error) {
	tpl, err := load(pagePath, "templates/page.md")
	if err != nil {
		return "", err
	}
	sections := make([]string, 0, len(e.Speakers))
	speakers := make([]SpeakerData, 0, len(e.Speakers))
	for _, s := range e.Speakers {
		if s.Handle == "" && s.SessionTitle == "" {
			continue // skeleton placeholder from scaffold
		}
		sec, err := RenderSpeaker(s, speakerPath)
		if err != nil {
			return "", err
		}
		sections = append(sections, strings.TrimRight(sec, "\n"))
		speakers = append(speakers, speakerData(s))
	}
	d := PageData{
		Title:           e.Event.Title,
		Slug:            e.Event.Slug,
		Date:            e.Event.Date,
		DateJP:          dateJP(e.Event),
		Mode:            string(e.Event.Mode),
		ConnpassURL:     e.Event.ConnpassURL,
		Venue:           e.Venue,
		Streaming:       e.Streaming,
		Timetable:       e.Timetable,
		TimetableTable:  timetableTable(e.Timetable),
		SpeakersSection: strings.Join(sections, "\n\n"),
		Speakers:        speakers,
	}
	return render("page", tpl, d)
}

// RenderSpeaker renders a single speaker section — used inside RenderPage
// and standalone when a speaker issue is added.
func RenderSpeaker(s event.Speaker, path string) (string, error) {
	tpl, err := load(path, "templates/speaker.md")
	if err != nil {
		return "", err
	}
	return render("speaker", tpl, speakerData(s))
}

func speakerData(s event.Speaker) SpeakerData {
	name := s.Handle
	if s.Remote {
		name += "（リモート登壇）"
	}
	title := s.SessionTitle
	if title == "" {
		title = "タイトル未定"
	}
	return SpeakerData{
		Handle: s.Handle, SNS: s.SNS, Bio: s.Bio,
		SessionTitle: s.SessionTitle, Remote: s.Remote,
		DisplayName: name, DisplaySessionTitle: title,
	}
}

func load(path, defaultName string) (string, error) {
	if path == "" {
		b, err := defaults.ReadFile(defaultName)
		if err != nil {
			return "", fmt.Errorf("embedded template %s: %w", defaultName, err)
		}
		return string(b), nil
	}
	b, err := os.ReadFile(path)
	if err != nil {
		return "", fmt.Errorf("registry template: %w", err)
	}
	return string(b), nil
}

func render(name, tpl string, data any) (string, error) {
	t, err := template.New(name).Parse(tpl)
	if err != nil {
		return "", fmt.Errorf("parse %s template: %w", name, err)
	}
	var b strings.Builder
	if err := t.Execute(&b, data); err != nil {
		return "", fmt.Errorf("render %s template: %w", name, err)
	}
	return b.String(), nil
}

var weekdayJP = [...]string{"日", "月", "火", "水", "木", "金", "土"}

func dateJP(m event.Meta) string {
	t, err := m.DateTime()
	if err != nil {
		return m.Date
	}
	return fmt.Sprintf("%d年%d月%d日（%s）",
		t.Year(), t.Month(), t.Day(), weekdayJP[t.Weekday()])
}

func timetableTable(slots []event.Slot) string {
	if len(slots) == 0 {
		return ""
	}
	var b strings.Builder
	b.WriteString("| 時間 | 内容 | 登壇者 |\n|---|---|---|\n")
	for _, s := range slots {
		fmt.Fprintf(&b, "| %s | %s | %s |\n", s.Start, s.Title, s.Speaker)
	}
	return strings.TrimRight(b.String(), "\n")
}
