// ichiza — community event operations as Code.
package main

import (
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/gr1m0h/ichiza/internal/config"
	"github.com/gr1m0h/ichiza/internal/event"
	"github.com/gr1m0h/ichiza/internal/notify"
	"github.com/gr1m0h/ichiza/internal/registry"
	"github.com/gr1m0h/ichiza/internal/remind"
	"github.com/gr1m0h/ichiza/internal/scaffold"
)

const usage = `ichiza — community event operations as Code

Usage:
  ichiza new       --slug <slug> --title <title> --date <YYYY-MM-DD>
                   [--mode onsite|hybrid|online] [--lifecycle <path>] [--issues]
  ichiza remind    [--notify stdout|slack] [--days 7] [--today <YYYY-MM-DD>]
  ichiza registry  --slug <slug>
  ichiza help

Coming soon: watch, draft, kpt
`

func main() {
	if len(os.Args) < 2 {
		fmt.Fprint(os.Stderr, usage)
		os.Exit(2)
	}
	var err error
	switch os.Args[1] {
	case "new":
		err = cmdNew(os.Args[2:])
	case "remind":
		err = cmdRemind(os.Args[2:])
	case "registry":
		err = cmdRegistry(os.Args[2:])
	case "help", "-h", "--help":
		fmt.Print(usage)
	default:
		fmt.Fprintf(os.Stderr, "unknown command %q\n\n%s", os.Args[1], usage)
		os.Exit(2)
	}
	if err != nil {
		fmt.Fprintln(os.Stderr, "ichiza:", err)
		os.Exit(1)
	}
}

func cmdNew(args []string) error {
	fs := flag.NewFlagSet("new", flag.ExitOnError)
	slug := fs.String("slug", "", "event slug (e.g. tokyo-3)")
	title := fs.String("title", "", "event title")
	date := fs.String("date", "", "event date YYYY-MM-DD")
	mode := fs.String("mode", "", "onsite | hybrid | online (default: ichiza.yaml defaults.mode)")
	lc := fs.String("lifecycle", "", "lifecycle template path (default: ichiza.yaml lifecycle)")
	cfgPath := fs.String("config", "ichiza.yaml", "root config path")
	issues := fs.Bool("issues", false, "also create GitHub issues via gh")
	if err := fs.Parse(args); err != nil {
		return err
	}
	if *slug == "" || *title == "" || *date == "" {
		return fmt.Errorf("--slug, --title, --date are required")
	}
	cfg, err := config.Load(*cfgPath)
	if err != nil {
		return err
	}
	if *mode == "" {
		*mode = string(cfg.Defaults.Mode)
	}
	m, err := event.ParseMode(*mode)
	if err != nil {
		return err
	}
	res, err := scaffold.Run(scaffold.Options{
		Slug: *slug, Title: *title, Date: *date, Mode: m,
		LifecyclePath: *lc, CreateIssues: *issues, Config: cfg,
	})
	if err != nil {
		return err
	}
	fmt.Printf("created %s (%d tasks)\n", res.Dir, len(res.Tasks))
	for _, t := range res.Tasks {
		fmt.Printf("  %s  %s\n", t.Due.Format("2006-01-02"), t.Title)
	}
	return nil
}

func cmdRemind(args []string) error {
	fs := flag.NewFlagSet("remind", flag.ExitOnError)
	cfgPath := fs.String("config", "ichiza.yaml", "root config path")
	dest := fs.String("notify", "stdout", "stdout | slack (slack reads SLACK_WEBHOOK_URL)")
	days := fs.Int("days", 7, "look-ahead window in days")
	today := fs.String("today", "", "override today for dry runs (YYYY-MM-DD)")
	if err := fs.Parse(args); err != nil {
		return err
	}
	now := time.Now()
	if *today != "" {
		var err error
		if now, err = time.Parse("2006-01-02", *today); err != nil {
			return fmt.Errorf("--today: %w", err)
		}
	}
	cfg, err := config.Load(*cfgPath)
	if err != nil {
		return err
	}
	digests, err := remind.Collect(remind.Options{
		EventsDir: cfg.EventsDir, Now: now, WindowDays: *days,
	})
	if err != nil {
		return err
	}
	if len(digests) == 0 {
		fmt.Println("remind: 期限が近いタスクはありません")
		return nil
	}
	msg := remind.Message(now, digests)
	switch *dest {
	case "stdout":
		fmt.Println(msg)
	case "slack":
		url := os.Getenv("SLACK_WEBHOOK_URL")
		if url == "" {
			return fmt.Errorf("--notify slack requires SLACK_WEBHOOK_URL")
		}
		if err := notify.Slack(url, msg); err != nil {
			return err
		}
		fmt.Printf("remind: %d event(s) notified to slack\n", len(digests))
	default:
		return fmt.Errorf("invalid --notify %q (stdout|slack)", *dest)
	}
	return nil
}

// cmdRegistry renders the registration page draft (connpass 等) for
// copy-paste. Speakers live in event.yaml (the SSoT) — after adding one,
// re-render the full page and paste it over the published body.
func cmdRegistry(args []string) error {
	fs := flag.NewFlagSet("registry", flag.ExitOnError)
	cfgPath := fs.String("config", "ichiza.yaml", "root config path")
	slug := fs.String("slug", "", "render the full page draft for events/<slug>")
	if err := fs.Parse(args); err != nil {
		return err
	}
	if *slug == "" {
		return fmt.Errorf("--slug is required")
	}
	cfg, err := config.Load(*cfgPath)
	if err != nil {
		return err
	}
	e, err := event.Load(filepath.Join(cfg.EventsDir, *slug, "event.yaml"))
	if err != nil {
		return err
	}
	out, err := registry.RenderPage(e, cfg.Registry.Templates.Page, cfg.Registry.Templates.Speaker)
	if err != nil {
		return err
	}
	fmt.Print(out)
	return nil
}
