// Package notify delivers messages to external channels.
// Adapters stay dumb: payload in, HTTP out.
package notify

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

// Slack posts text to an Incoming Webhook URL.
func Slack(webhookURL, text string) error {
	return postSlack(webhookURL, map[string]string{"text": text})
}

type SlackText struct {
	Type     string `json:"type"`
	Text     string `json:"text"`
	Verbatim bool   `json:"verbatim,omitempty"`
}

type SlackBlock struct {
	Type     string      `json:"type"`
	Text     *SlackText  `json:"text,omitempty"`
	Fields   []SlackText `json:"fields,omitempty"`
	Elements []SlackText `json:"elements,omitempty"`
}

type SlackMessage struct {
	Text        string       `json:"text"`
	Blocks      []SlackBlock `json:"blocks"`
	Mrkdwn      bool         `json:"mrkdwn"`
	UnfurlLinks bool         `json:"unfurl_links"`
	UnfurlMedia bool         `json:"unfurl_media"`
}

// SlackRich preserves an accessible text fallback alongside the visual blocks.
func SlackRich(webhookURL string, message SlackMessage) error {
	return postSlack(webhookURL, message)
}

func postSlack(webhookURL string, message any) error {
	payload, err := json.Marshal(message)
	if err != nil {
		return err
	}
	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Post(webhookURL, "application/json", bytes.NewReader(payload))
	if err != nil {
		return fmt.Errorf("slack webhook: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return fmt.Errorf("slack webhook: status %d: %s", resp.StatusCode, bytes.TrimSpace(body))
	}
	return nil
}
