// connpass adapter: fetches registration stats via connpass API v2
// (https://connpass.com/about/api/v2/). Read-only — the API has no write
// endpoints. Requires an API key issued by connpass support, passed via
// the X-API-Key header; User-Agent is also required (403 without it).
package watch

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"
)

const connpassEndpoint = "https://connpass.com/api/v2/events/"

// userAgent identifies ichiza to connpass (the API rejects requests
// without a User-Agent header).
const userAgent = "ichiza (+https://github.com/gr1m0h/ichiza)"

type connpassAdapter struct {
	apiKey   string
	endpoint string
	client   *http.Client
}

// NewConnpass returns a Fetcher backed by connpass API v2.
func NewConnpass(apiKey string) Fetcher {
	return &connpassAdapter{
		apiKey:   apiKey,
		endpoint: connpassEndpoint,
		client:   &http.Client{Timeout: 10 * time.Second},
	}
}

// connpassEvent mirrors the fields of /api/v2/events/ we consume.
// limit is null on connpass when the event has no capacity cap.
type connpassEvent struct {
	ID         int    `json:"id"`
	Title      string `json:"title"`
	URL        string `json:"url"`
	Limit      *int   `json:"limit"`
	Accepted   int    `json:"accepted"`
	Waiting    int    `json:"waiting"`
	OpenStatus string `json:"open_status"`
}

type connpassResponse struct {
	Events []connpassEvent `json:"events"`
}

// Fetch queries the given connpass event IDs in a single request
// (event_id accepts comma-separated values, count is capped at 100).
func (c *connpassAdapter) Fetch(ids []int) (map[int]Stats, error) {
	if len(ids) == 0 {
		return map[int]Stats{}, nil
	}
	if len(ids) > 100 {
		return nil, fmt.Errorf("connpass: too many events in one watch run (%d > 100)", len(ids))
	}
	strs := make([]string, len(ids))
	for i, id := range ids {
		strs[i] = strconv.Itoa(id)
	}
	q := url.Values{}
	q.Set("event_id", strings.Join(strs, ","))
	q.Set("count", "100")

	req, err := http.NewRequest(http.MethodGet, c.endpoint+"?"+q.Encode(), nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("X-API-Key", c.apiKey)
	req.Header.Set("User-Agent", userAgent)

	resp, err := c.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("connpass api: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return nil, fmt.Errorf("connpass api: status %d: %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}
	var parsed connpassResponse
	if err := json.NewDecoder(resp.Body).Decode(&parsed); err != nil {
		return nil, fmt.Errorf("connpass api: parse response: %w", err)
	}
	out := make(map[int]Stats, len(parsed.Events))
	for _, e := range parsed.Events {
		out[e.ID] = Stats{
			EventID:    e.ID,
			Title:      e.Title,
			URL:        e.URL,
			Limit:      e.Limit,
			Accepted:   e.Accepted,
			Waiting:    e.Waiting,
			OpenStatus: e.OpenStatus,
		}
	}
	return out, nil
}

// connpass event URLs look like https://<subdomain>.connpass.com/event/12345/
// (custom subdomains included — only the /event/<id>/ path segment matters).
var eventIDPattern = regexp.MustCompile(`/event/(\d+)(?:/|$)`)

// EventIDFromURL extracts the numeric event ID from a connpass event URL.
func EventIDFromURL(rawURL string) (int, error) {
	u, err := url.Parse(rawURL)
	if err != nil {
		return 0, fmt.Errorf("connpass_url %q: %w", rawURL, err)
	}
	m := eventIDPattern.FindStringSubmatch(u.Path)
	if m == nil {
		return 0, fmt.Errorf("connpass_url %q: no /event/<id>/ segment", rawURL)
	}
	id, err := strconv.Atoi(m[1])
	if err != nil {
		return 0, fmt.Errorf("connpass_url %q: %w", rawURL, err)
	}
	return id, nil
}
