package event

import (
	"path/filepath"
	"testing"
)

func TestParseMode(t *testing.T) {
	for _, valid := range []string{"onsite", "hybrid", "online"} {
		if _, err := ParseMode(valid); err != nil {
			t.Errorf("ParseMode(%q) = %v", valid, err)
		}
	}
	for _, invalid := range []string{"", "offline", "ONSITE"} {
		if _, err := ParseMode(invalid); err == nil {
			t.Errorf("ParseMode(%q) = nil error, want error", invalid)
		}
	}
}

func TestSkeleton(t *testing.T) {
	defaults := SkeletonDefaults{
		Venue:         &Venue{Capacity: 30},
		Roles:         []string{"mc", "reception"},
		Streaming:     &Streaming{Platform: "streamyard"},
		StreamingRole: "streaming",
	}

	t.Run("onsite: venue yes, streaming no", func(t *testing.T) {
		e := Skeleton("s", "T", "2026-10-30", ModeOnsite, defaults)
		if e.Venue == nil || e.Venue.Capacity != 30 {
			t.Errorf("venue = %+v", e.Venue)
		}
		if e.Streaming != nil {
			t.Errorf("streaming = %+v, want nil", e.Streaming)
		}
		if _, ok := e.Roles["streaming"]; ok {
			t.Error("onsite should not add streaming role")
		}
	})

	t.Run("online: streaming yes, venue no", func(t *testing.T) {
		e := Skeleton("s", "T", "2026-10-30", ModeOnline, defaults)
		if e.Venue != nil {
			t.Errorf("venue = %+v, want nil", e.Venue)
		}
		if e.Streaming == nil || e.Streaming.Platform != "streamyard" {
			t.Errorf("streaming = %+v", e.Streaming)
		}
		if _, ok := e.Roles["streaming"]; !ok {
			t.Error("online should add streaming role")
		}
	})

	t.Run("hybrid without defaults gets empty sections", func(t *testing.T) {
		e := Skeleton("s", "T", "2026-10-30", ModeHybrid, SkeletonDefaults{})
		if e.Venue == nil || e.Streaming == nil {
			t.Errorf("venue = %+v, streaming = %+v, want non-nil placeholders", e.Venue, e.Streaming)
		}
	})
}

func TestSaveLoadRoundtrip(t *testing.T) {
	path := filepath.Join(t.TempDir(), "event.yaml")
	in := &Event{
		Event:    Meta{Slug: "hiroshima-1", Title: "SRE Lounge Hiroshima #1", Date: "2026-10-30", Mode: ModeHybrid},
		Speakers: []Speaker{{Handle: "gr1m0h", Remote: true}},
		Roles:    map[string]string{"mc": "gr1m0h"},
	}
	if err := in.Save(path); err != nil {
		t.Fatal(err)
	}
	out, err := Load(path)
	if err != nil {
		t.Fatal(err)
	}
	if out.Event != in.Event {
		t.Errorf("meta = %+v, want %+v", out.Event, in.Event)
	}
	if len(out.Speakers) != 1 || out.Speakers[0] != in.Speakers[0] {
		t.Errorf("speakers = %+v", out.Speakers)
	}
	if out.Roles["mc"] != "gr1m0h" {
		t.Errorf("roles = %+v", out.Roles)
	}
}

func TestLoadErrors(t *testing.T) {
	if _, err := Load(filepath.Join(t.TempDir(), "nope.yaml")); err == nil {
		t.Error("Load(missing) = nil error, want error")
	}
}

func TestDateTime(t *testing.T) {
	if _, err := (Meta{Date: "2026-10-30"}).DateTime(); err != nil {
		t.Error(err)
	}
	if _, err := (Meta{Date: "Oct 30"}).DateTime(); err == nil {
		t.Error("DateTime() = nil error for bad date, want error")
	}
}
