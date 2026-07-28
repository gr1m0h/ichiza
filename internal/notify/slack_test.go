package notify

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestSlack(t *testing.T) {
	var got map[string]string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			t.Errorf("method = %s, want POST", r.Method)
		}
		if ct := r.Header.Get("Content-Type"); ct != "application/json" {
			t.Errorf("content-type = %s", ct)
		}
		body, _ := io.ReadAll(r.Body)
		if err := json.Unmarshal(body, &got); err != nil {
			t.Errorf("body is not JSON: %v", err)
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	if err := Slack(srv.URL, "hello ⏰"); err != nil {
		t.Fatal(err)
	}
	if got["text"] != "hello ⏰" {
		t.Errorf(`payload text = %q, want "hello ⏰"`, got["text"])
	}
}

func TestSlackServerError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "invalid_payload", http.StatusBadRequest)
	}))
	defer srv.Close()

	if err := Slack(srv.URL, "x"); err == nil {
		t.Error("Slack() = nil error on 400, want error")
	}
}

func TestSlackUnreachable(t *testing.T) {
	if err := Slack("http://127.0.0.1:1/webhook", "x"); err == nil {
		t.Error("Slack() = nil error on unreachable host, want error")
	}
}
