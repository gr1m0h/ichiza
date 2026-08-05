package registry

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/gr1m0h/ichiza/internal/event"
)

func sampleEvent() *event.Event {
	return &event.Event{
		Event: event.Meta{
			Slug: "tokyo-3", Title: "Your Meetup #3",
			Date: "2026-11-28", Mode: event.ModeHybrid,
		},
		Venue: &event.Venue{Name: "〇〇ビル 3F", Capacity: 30},
		Streaming: &event.Streaming{
			Platform: "streamyard", YouTubeURL: "https://youtube.com/watch?v=x",
		},
		Timetable: []event.Slot{
			{Start: "19:00", Title: "オープニング"},
			{Start: "19:10", Title: "セッション1", Speaker: "alice"},
		},
		Speakers: []event.Speaker{
			{Handle: "alice", SNS: "https://x.com/alice", Bio: "SRE",
				SessionTitle: "SLO入門", Remote: false},
			{}, // scaffold の空雛形はスキップされる
		},
	}
}

func TestRenderPageDefault(t *testing.T) {
	out, err := RenderPage(sampleEvent(), "", "")
	if err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{
		"2026年11月28日（土）",
		"〇〇ビル 3F",
		"| 19:00 | オープニング |  |",
		"| 19:10 | セッション1 | alice |",
		"### SLO入門",
		"https://x.com/alice",
	} {
		if !strings.Contains(out, want) {
			t.Errorf("RenderPage() should contain %q:\n%s", want, out)
		}
	}
	if strings.Contains(out, "タイトル未定") {
		t.Errorf("empty speaker skeleton should be skipped:\n%s", out)
	}
}

func TestRenderPageOmitsEmptyStreaming(t *testing.T) {
	tests := []struct {
		name      string
		streaming *event.Streaming
	}{
		{"onsite nil", nil},
		{"hybrid empty platform", &event.Streaming{}}, // scaffold の空雛形
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			e := sampleEvent()
			e.Streaming = tt.streaming
			out, err := RenderPage(e, "", "")
			if err != nil {
				t.Fatal(err)
			}
			if strings.Contains(out, "配信") {
				t.Errorf("page should not mention streaming:\n%s", out)
			}
		})
	}
}

func TestRenderPageCustomTemplate(t *testing.T) {
	dir := t.TempDir()
	page := filepath.Join(dir, "page.md")
	tpl := "# {{.Title}}\n開催日: {{.Date}}\n\n{{.TimetableTable}}\n"
	if err := os.WriteFile(page, []byte(tpl), 0o644); err != nil {
		t.Fatal(err)
	}
	out, err := RenderPage(sampleEvent(), page, "")
	if err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{
		"# Your Meetup #3",
		"開催日: 2026-11-28",
		"| 19:10 | セッション1 | alice |",
	} {
		if !strings.Contains(out, want) {
			t.Errorf("custom template output should contain %q:\n%s", want, out)
		}
	}
}

func TestRenderPageCustomSpeakerTemplate(t *testing.T) {
	dir := t.TempDir()
	sp := filepath.Join(dir, "speaker.md")
	if err := os.WriteFile(sp, []byte("- {{.DisplayName}}: {{.DisplaySessionTitle}}\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	out, err := RenderPage(sampleEvent(), "", sp)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(out, "- alice: SLO入門") {
		t.Errorf("speakers section should use custom speaker template:\n%s", out)
	}
}

func TestRenderSpeaker(t *testing.T) {
	tests := []struct {
		name    string
		speaker event.Speaker
		want    []string
	}{
		{
			name: "full",
			speaker: event.Speaker{Handle: "bob", SNS: "https://x.com/bob",
				Bio: "Backend engineer", SessionTitle: "Go実践", Remote: true},
			want: []string{"### Go実践", "bob（リモート登壇）", "https://x.com/bob", "Backend engineer"},
		},
		{
			name:    "untitled",
			speaker: event.Speaker{Handle: "carol"},
			want:    []string{"### タイトル未定", "carol"},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			out, err := RenderSpeaker(tt.speaker, "")
			if err != nil {
				t.Fatal(err)
			}
			for _, want := range tt.want {
				if !strings.Contains(out, want) {
					t.Errorf("RenderSpeaker() should contain %q:\n%s", want, out)
				}
			}
		})
	}
}

func TestRenderPageMissingTemplateFile(t *testing.T) {
	if _, err := RenderPage(sampleEvent(), "no/such/file.md", ""); err == nil {
		t.Error("missing template file should return an error")
	}
}

func TestDateJPFallback(t *testing.T) {
	e := sampleEvent()
	e.Event.Date = "TBD"
	out, err := RenderPage(e, "", "")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(out, "TBD") {
		t.Errorf("unparseable date should fall back to raw string:\n%s", out)
	}
}
