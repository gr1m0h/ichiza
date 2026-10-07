// ichiza — community event operations as Code.
package main

import (
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/gr1m0h/ichiza/internal/config"
	"github.com/gr1m0h/ichiza/internal/dashboard"
	"github.com/gr1m0h/ichiza/internal/event"
	"github.com/gr1m0h/ichiza/internal/notify"
	"github.com/gr1m0h/ichiza/internal/registry"
	"github.com/gr1m0h/ichiza/internal/remind"
	"github.com/gr1m0h/ichiza/internal/scaffold"
	"github.com/gr1m0h/ichiza/internal/watch"
)

const usage = `ichiza — community event operations as Code

Usage:
  ichiza new       --slug <slug> --title <title> --date <YYYY-MM-DD>
                   [--mode onsite|hybrid|online] [--lifecycle <path>] [--dashboard]
  ichiza remind    [--notify stdout|slack] [--days 7] [--today <YYYY-MM-DD>]
  ichiza dashboard reconcile --issue <number>
  ichiza dashboard sync --slug <slug> [--config ichiza.yaml]
  ichiza web-config [--config ichiza.yaml]
  ichiza registry  --slug <slug>
  ichiza watch     [--notify stdout|slack] [--slug <slug>] [--today <YYYY-MM-DD>]
                   (CONNPASS_API_KEY required)
  ichiza help

Coming soon: draft, kpt
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
	case "dashboard":
		err = cmdDashboard(os.Args[2:])
	case "web-config":
		err = cmdWebConfig(os.Args[2:])
	case "registry":
		err = cmdRegistry(os.Args[2:])
	case "watch":
		err = cmdWatch(os.Args[2:])
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

func cmdWebConfig(args []string) error {
	fs := flag.NewFlagSet("web-config", flag.ExitOnError)
	cfgPath := fs.String("config", "ichiza.yaml", "root config path")
	if err := fs.Parse(args); err != nil {
		return err
	}
	cfg, err := config.Load(*cfgPath)
	if err != nil {
		return err
	}
	webConfig, err := cfg.WebConfigJSON()
	if err != nil {
		return err
	}
	fmt.Println(webConfig)
	return nil
}

func cmdDashboard(args []string) error {
	if len(args) == 0 {
		return fmt.Errorf("dashboard requires: reconcile --issue <number> or sync --slug <slug>")
	}
	if args[0] == "sync" {
		fs := flag.NewFlagSet("dashboard sync", flag.ExitOnError)
		slug := fs.String("slug", "", "event slug")
		cfgPath := fs.String("config", "ichiza.yaml", "root config path")
		if err := fs.Parse(args[1:]); err != nil {
			return err
		}
		if *slug == "" {
			return fmt.Errorf("--slug is required")
		}
		cfg, err := config.Load(*cfgPath)
		if err != nil {
			return err
		}
		issueNumber, err := dashboard.Sync(*slug, cfg.EventsDir)
		if err != nil {
			return err
		}
		if _, err := dashboard.Reconcile(issueNumber); err != nil {
			return err
		}
		fmt.Printf("dashboard issue #%d synced from event %s\n", issueNumber, *slug)
		return nil
	}
	if args[0] != "reconcile" {
		return fmt.Errorf("dashboard requires: reconcile --issue <number> or sync --slug <slug>")
	}
	fs := flag.NewFlagSet("dashboard reconcile", flag.ExitOnError)
	issue := fs.Int("issue", 0, "Dashboard Issue number")
	if err := fs.Parse(args[1:]); err != nil {
		return err
	}
	if *issue <= 0 {
		return fmt.Errorf("--issue is required")
	}
	result, err := dashboard.Reconcile(*issue)
	if err != nil {
		return err
	}
	if result.Changed {
		fmt.Printf("dashboard issue #%d -> %s\n", *issue, strings.ToLower(result.State))
	} else {
		fmt.Printf("dashboard issue #%d already %s\n", *issue, strings.ToLower(result.State))
	}
	return nil
}

func cmdNew(args []string) error {
	fs := flag.NewFlagSet("new", flag.ExitOnError)
	slug := fs.String("slug", "", "event slug (e.g. tokyo-3)")
	title := fs.String("title", "", "event title")
	date := fs.String("date", "", "event date YYYY-MM-DD")
	mode := fs.String("mode", "", "onsite | hybrid | online (default: ichiza.yaml defaults.mode)")
	lc := fs.String("lifecycle", "", "lifecycle template path (default: ichiza.yaml lifecycle)")
	cfgPath := fs.String("config", "ichiza.yaml", "root config path")
	dashboardIssue := fs.Bool("dashboard", false, "also create one GitHub Dashboard Issue via gh")
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
		LifecyclePath: *lc, CreateDashboard: *dashboardIssue, Config: cfg,
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
	cfg, err := config.Load(*cfgPath)
	if err != nil {
		return err
	}
	location, err := time.LoadLocation(cfg.Timezone)
	if err != nil {
		return fmt.Errorf("timezone %q: %w", cfg.Timezone, err)
	}
	now := time.Now().In(location)
	if *today != "" {
		if now, err = time.ParseInLocation("2006-01-02", *today, location); err != nil {
			return fmt.Errorf("--today: %w", err)
		}
	}
	completed, err := remind.DashboardTasks()
	if err != nil {
		return fmt.Errorf("dashboard issue の完了状態を取得: %w", err)
	}
	digests, err := remind.Collect(remind.Options{
		EventsDir: cfg.EventsDir, Now: now, WindowDays: *days,
		CompletedTasks: completed,
	})
	if err != nil {
		return err
	}
	if len(digests) == 0 {
		fmt.Println("remind: 期限が近いタスクはありません")
		return nil
	}
	msg := remind.Message(now, digests, cfg.SlackUsersByGitHub())
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

// cmdWatch reports live registration counts (申込数) for upcoming events
// via the registry adapter (connpass API v2). Read-only: connpass has no
// write API, so watch closes the loop that registry's copy-paste opens.
func cmdWatch(args []string) error {
	fs := flag.NewFlagSet("watch", flag.ExitOnError)
	cfgPath := fs.String("config", "ichiza.yaml", "root config path")
	dest := fs.String("notify", "stdout", "stdout | slack (slack reads SLACK_WEBHOOK_URL)")
	slug := fs.String("slug", "", "watch only events/<slug> (past events included)")
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
	fetcher, err := watch.New(cfg.Registry.Type, os.Getenv("CONNPASS_API_KEY"))
	if err != nil {
		return err
	}
	digests, skipped, err := watch.Collect(watch.Options{
		EventsDir: cfg.EventsDir, Now: now, Slug: *slug,
	}, fetcher)
	if err != nil {
		return err
	}
	if len(digests) == 0 && len(skipped) == 0 {
		fmt.Println("watch: ウォッチ対象のイベントはありません")
		return nil
	}
	msg := watch.Message(now, digests, skipped)
	switch *dest {
	case "stdout":
		fmt.Println(msg)
	case "slack":
		// Nothing published yet (connpass_url all unset) → dormant: keep the
		// report in the run log but stay silent on Slack. remind already
		// nags about the "connpassページ公開" task, so a daily ⚠️ here would
		// only duplicate it.
		if len(digests) == 0 {
			fmt.Println(msg)
			fmt.Println("watch: 公開中のイベントがないため Slack 通知をスキップ")
			return nil
		}
		url := os.Getenv("SLACK_WEBHOOK_URL")
		if url == "" {
			return fmt.Errorf("--notify slack requires SLACK_WEBHOOK_URL")
		}
		if err := notify.Slack(url, msg); err != nil {
			return err
		}
		fmt.Printf("watch: %d event(s) notified to slack\n", len(digests))
	default:
		return fmt.Errorf("invalid --notify %q (stdout|slack)", *dest)
	}
	return nil
}
