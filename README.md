# ichiza（一座）

Community event operations as Code — a CLI & GitHub Actions platform.

> A serverless CLI & GitHub Actions platform for running meetups: define an
> event once (`event.yaml`) and derive announcements, reminders, and task
> tracking from it. Docs and generated artifacts are currently Japanese-first,
> as the tool targets the Japanese meetup ecosystem (connpass).

勉強会・ミートアップ運営の CLI & GitHub Actions プラットフォーム。
イベント定義（event.yaml）から告知・リマインド・Dashboard管理を派生させます。

## はじめる

[ichiza-starter](https://github.com/gr1m0h/ichiza-starter) から運営リポジトリを作ります。

```console
# 1. 運営リポジトリを作成
$ gh repo create <owner>/<repo> --template gr1m0h/ichiza-starter --private --clone

# 2. GitHub Actions に PR の作成を許可（個人アカウントは既定で不許可）
$ gh api -X PUT repos/<owner>/<repo>/actions/permissions/workflow \
    -f default_workflow_permissions=read -F can_approve_pull_request_reviews=true

# 3. Slack リマインドの通知先（Incoming Webhook）
$ gh secret set SLACK_WEBHOOK_URL --repo <owner>/<repo>
```

イベント作成は Actions タブ → **ichiza new** → **Run workflow**。
`events/<slug>/event.yaml` + `tasks.yaml` のPRと、開催日から逆算したタスクを持つ
Dashboard Issueが1件生成されます。完了操作はDashboardのCheckboxで行います。
セットアップの詳細と日々の運用は
[starter の README](https://github.com/gr1m0h/ichiza-starter) を参照してください。

## 配布モデル

```text
gr1m0h/ichiza          # 本体: CLI + composite actions
├── actions/setup      # CLI インストール
├── actions/new        # イベント作成（scaffold → PR + Dashboard Issue）
├── actions/dashboard  # Checkbox完了状態に応じたIssue close/reopen
├── actions/remind     # 期限リマインド（cron）
├── actions/registry   # 募集ページ本文の再生成（event.yaml 更新時）
├── actions/watch      # 申込数ウォッチ（cron / connpass API v2）
├── actions/web-deploy # 共通Webを利用者のCloudflare Workerへdeploy
└── web                # Hono製private Webコックピット

gr1m0h/ichiza-starter  # コミュニティが複製するテンプレート（template repository）
```

## CLI を直接使う

Actions の中身は同じ CLI なので、ローカルでも実行できます。

```console
$ go install github.com/gr1m0h/ichiza@latest

$ ichiza new --slug tokyo-3 --title "Your Meetup #3" --date 2026-11-28
$ ichiza new ... --dashboard      # 1イベント = 1 Dashboard Issueを作成

$ ichiza remind [--notify slack]  # 期限超過 + 7日以内のタスクを表示 / Slack 通知
$ ichiza dashboard reconcile --issue 42 # 全完了ならclose、未完了ならreopen
$ ichiza dashboard sync --slug tokyo-3  # 定義を反映し、完了状態とNotesを保持
$ ichiza registry --slug tokyo-3  # 募集ページ本文を生成（connpass コピペ用）

$ export CONNPASS_API_KEY=...     # connpass サポートへの申請制
$ ichiza watch [--notify slack]   # 開催前イベントの申込数 / 補欠 / 受付状態
```

- タスク管理は1イベント = 1 Dashboard Issue。各タスクはトップレベルCheckboxで、
  Checkboxだけが完了状態の正本です。GitHub Projectsでは1イベントを1カードとして扱えます。
- `dashboard sync` は event/tasks 定義を再反映し、task ID ごとの完了状態と Notes を保持
- `remind` は announce ラベルのタスクに X の投稿画面を開く intent URL を添付
- `registry` は connpass に書き込み API がないため「コピーして新規作成 → ペースト」
  まで人間の作業を圧縮する設計。本文テンプレートは運営リポジトリ側でカスタマイズ可能
- `watch` は `registry.type` で adapter を選択。connpass 以外のサービスは
  Fetcher adapter の追加で対応

## Web コックピット（任意・alpha）

`web/` は Hono + Cloudflare Workers のDBなし構成です。GitHubのDashboard Issueを正本として、
イベント一覧・詳細・My Page・期限状態・チェック操作を提供します。運営リポジトリ側は
starterの `ichiza-web.yml` から共通の `actions/web-deploy` を呼ぶだけで、Web実装を複製しません。

全画面をCloudflare Accessで保護し、認証メールを `ichiza.yaml` の `members.email` と照合します。
カスタムドメインは不要で、`workers.dev` URLを利用できます。alphaでは対象リポジトリ1件、
Issues read/write、Metadata read-onlyに限定したfine-grained PATをWorker secretとして使います。
正式版ではGitHub Appへ移行する想定です。詳しい導入手順は
[ichiza-starter](https://github.com/gr1m0h/ichiza-starter)を参照してください。

## Lifecycle テンプレート

タスクは開催日からのオフセットで定義します。`modes` を持つタスクは
該当モード（onsite / hybrid / online）のときだけ展開されます。

```yaml
tasks:
  - id: publish-page
    title: connpassページ公開
    due: -30d
    labels: [announce]
  - id: rehearsal
    title: 配信リハ（音声経路テスト）
    due: -3d
    modes: [hybrid, online]
```

同梱の `templates/lifecycle.yaml` は最小構成のニュートラルなテンプレート。
フル構成の例は `examples/meetup/` を参照 — **コアはコミュニティ非依存、
要件はすべて設定で表現**が設計原則です。
全パラメータは [docs/configuration.md](docs/configuration.md) を参照してください。

## Roadmap

未実装の機能のみ載せています。実装が完了した項目はここから削除し、
機能として本文と [docs/configuration.md](docs/configuration.md) に記載します。

- [ ] `ichiza draft` — 告知記事・開催記事・司会資料の下書き生成
- [ ] `ichiza kpt` — アンケート集計 → KPT 下書き
