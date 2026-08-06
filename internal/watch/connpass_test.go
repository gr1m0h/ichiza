package watch

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

// fixture mirrors the official /api/v2/events/ response shape
// (fields we consume; limit is null for uncapped events).
const eventsFixture = `{
  "results_returned": 2,
  "results_available": 2,
  "results_start": 1,
  "events": [
    {
      "id": 1111,
      "title": "Meetup #3",
      "url": "https://example.connpass.com/event/1111/",
      "limit": 50,
      "accepted": 40,
      "waiting": 5,
      "open_status": "open"
    },
    {
      "id": 2222,
      "title": "Online #1",
      "url": "https://example.connpass.com/event/2222/",
      "limit": null,
      "accepted": 120,
      "waiting": 0,
      "open_status": "preopen"
    }
  ]
}`

func testAdapter(t *testing.T, handler http.HandlerFunc) *connpassAdapter {
	t.Helper()
	srv := httptest.NewServer(handler)
	t.Cleanup(srv.Close)
	return &connpassAdapter{
		apiKey:   "test-key",
		endpoint: srv.URL + "/",
		client:   &http.Client{Timeout: 5 * time.Second},
	}
}

func TestConnpassFetch(t *testing.T) {
	var gotHeader http.Header
	var gotQuery string
	a := testAdapter(t, func(w http.ResponseWriter, r *http.Request) {
		gotHeader = r.Header
		gotQuery = r.URL.RawQuery
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(eventsFixture))
	})

	stats, err := a.Fetch([]int{1111, 2222})
	if err != nil {
		t.Fatal(err)
	}
	if gotHeader.Get("X-API-Key") != "test-key" {
		t.Errorf("X-API-Key = %q", gotHeader.Get("X-API-Key"))
	}
	// connpass returns 403 without a User-Agent
	if gotHeader.Get("User-Agent") == "" {
		t.Error("User-Agent header is required")
	}
	if gotQuery != "count=100&event_id=1111%2C2222" {
		t.Errorf("query = %q", gotQuery)
	}
	if len(stats) != 2 {
		t.Fatalf("got %d stats, want 2", len(stats))
	}
	s := stats[1111]
	if s.Accepted != 40 || s.Waiting != 5 || s.OpenStatus != "open" {
		t.Errorf("stats[1111] = %+v", s)
	}
	if s.Limit == nil || *s.Limit != 50 {
		t.Errorf("stats[1111].Limit = %v, want 50", s.Limit)
	}
	if stats[2222].Limit != nil {
		t.Errorf("stats[2222].Limit = %v, want nil (uncapped)", stats[2222].Limit)
	}
}

func TestConnpassFetchEmptyIDs(t *testing.T) {
	a := testAdapter(t, func(w http.ResponseWriter, r *http.Request) {
		t.Error("no request expected for empty ids")
	})
	stats, err := a.Fetch(nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(stats) != 0 {
		t.Errorf("stats = %+v, want empty", stats)
	}
}

func TestConnpassFetchTooManyIDs(t *testing.T) {
	a := testAdapter(t, func(w http.ResponseWriter, r *http.Request) {
		t.Error("no request expected over the 100-id cap")
	})
	ids := make([]int, 101)
	if _, err := a.Fetch(ids); err == nil {
		t.Error("want error for >100 ids")
	}
}

func TestConnpassFetchHTTPError(t *testing.T) {
	a := testAdapter(t, func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "Forbidden", http.StatusForbidden)
	})
	if _, err := a.Fetch([]int{1}); err == nil {
		t.Error("want error on 403")
	}
}

func TestEventIDFromURL(t *testing.T) {
	tests := []struct {
		url     string
		want    int
		wantErr bool
	}{
		{"https://example.connpass.com/event/12345/", 12345, false},
		{"https://connpass.com/event/1/", 1, false},
		{"https://example.connpass.com/event/12345", 12345, false},
		{"https://example.connpass.com/event/12345/?utm=x", 12345, false},
		{"https://example.connpass.com/", 0, true},
		{"not a url\x7f://", 0, true},
		{"https://example.connpass.com/event/abc/", 0, true},
	}
	for _, tt := range tests {
		got, err := EventIDFromURL(tt.url)
		if tt.wantErr {
			if err == nil {
				t.Errorf("EventIDFromURL(%q): want error, got %d", tt.url, got)
			}
			continue
		}
		if err != nil {
			t.Errorf("EventIDFromURL(%q): %v", tt.url, err)
			continue
		}
		if got != tt.want {
			t.Errorf("EventIDFromURL(%q) = %d, want %d", tt.url, got, tt.want)
		}
	}
}
