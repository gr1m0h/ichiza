# ichiza（一座）

Community event operations as Code — a CLI & GitHub Actions platform.

> A serverless CLI & GitHub Actions platform for running meetups: define an
> event once (`event.yaml`) and derive announcements, reminders, and task
> tracking from it. Docs and generated artifacts are currently Japanese-first,
> as the tool targets the Japanese meetup ecosystem (connpass).

勉強会・ミートアップ運営の CLI & GitHub Actions プラットフォーム。
イベント定義（event.yaml）から告知・リマインド・タスク管理を派生させます。

## はじめる

[ichiza-starter](https://github.com/gr1m0h/ichiza-starter) から運営リポジトリを作って始めます。

```console
# 1. 運営リポジトリを作成
$ gh repo create <owner>/<repo> --template gr1m0h/ichiza-starter --private --clone

# 2. GitHub Actions に旗揚げ PR の作成を許可（個人アカウントは既定で不許可）
$ gh api -X PUT repos/<owner>/<repo>/actions/permissions/workflow \
    -f default_workflow_permissions=read -F can_approve_pull_request_reviews=true

# 3. Slack リマインドの通知先（Incoming Webhook）
$ gh secret set SLACK_WEBHOOK_URL --repo <owner>/<repo>
```

ブラウザでも同じことができます（starter の **Use this template** →
Settings で上記 2, 3 を設定）。手順の詳細と日々の運用は
[starter の README](https://github.com/gr1m0h/ichiza-starter) を参照してください。

最初のイベント旗揚げ:

1. 運営リポジトリの Actions タブ → **ichiza new** → **Run workflow**
   （slug / title / date / mode を入力）
2. `events/<slug>/event.yaml` + `tasks.yaml` の PR と、開催日から逆算した
   期限つき GitHub Issues + マイルストーンが生成される
3. event.yaml に会場・タイムテーブルを追記して PR をマージ — 以降はこれが SSoT

## 配布モデル

```text
gr1m0h/ichiza          # 本体: CLI + composite actions
├── actions/setup      # CLI インストール
├── actions/new        # 旗揚げ（scaffold → PR + Issues + 募集ページ原稿）
├── actions/remind     # 期限リマインド（cron）
├── actions/registry   # 募集ページ原稿の再生成（event.yaml 更新時）
└── actions/watch      # 申込数ウォッチ（cron / connpass API v2）

gr1m0h/ichiza-starter  # コミュニティが複製するテンプレート（template repository）
├── .github/workflows/ichiza-new.yml     # Run workflow ボタン
├── .github/workflows/ichiza-remind.yml  # 毎朝の期限チェック
├── ichiza.yaml                          # root 設定（notifier/registry adapter）
├── templates/lifecycle.yaml             # ライフサイクル定義
└── templates/registry/                  # 募集ページ原稿の文面テンプレ
```

`actions/new` は PR 作成が許可されていないリポジトリでも失敗せず、job summary に
手動作成リンク（タイトル・本文入力済み）と設定手順を表示します。

## CLI を直接使う

Actions の中身は同じ CLI なので、ローカルでも実行できます。

```console
$ go install github.com/gr1m0h/ichiza@latest

$ ichiza new --slug tokyo-3 --title "Your Meetup #3" --date 2026-11-28
# 既定値（開催形態・役割・会場・配信設定）は ichiza.yaml の defaults で定義
$ ichiza new ... --issues   # gh CLI 経由で期限つき Issues も一括生成

$ ichiza remind                   # 期限超過 + 7日以内のタスクを表示
$ ichiza remind --notify slack    # SLACK_WEBHOOK_URL に通知（cron 用）
$ ichiza registry --slug tokyo-3  # 募集ページ原稿を生成（connpass コピペ用）

$ export CONNPASS_API_KEY=...     # connpass サポートへの申請制
$ ichiza watch                    # 開催前イベントの申込数 / 補欠 / 受付状態を表示
$ ichiza watch --notify slack     # SLACK_WEBHOOK_URL に通知（cron 用）
```

生成物:

- `events/<slug>/event.yaml` — イベント定義の雛形
- `events/<slug>/tasks.yaml` — lifecycle テンプレから逆算した期限つきタスク
- （`--issues`）マイルストーン + 期限入りタイトルの GitHub Issues

`remind` は announce ラベルのタスクに X の投稿画面を開く intent URL を添えるので、
通知からワンタップで告知ポストまで済む（`sns.x.mode: intent`）。

`registry` は connpass に書き込み API がないため「コピーして新規作成 → ペースト」まで
人間の作業を圧縮する設計。文面テンプレは運営リポジトリ側でカスタマイズできます。
`watch` の申込数取得は `registry.type` で adapter を選択し、connpass 以外のサービスは
Fetcher adapter の追加で対応します。

## Lifecycle テンプレート

タスクは開催日からのオフセットで定義します。`modes` を持つタスクは
該当モード（onsite / hybrid / online）のときだけ展開されます。

```yaml
tasks:
  - title: connpassページ公開
    due: -30d
    labels: [announce]
  - title: 配信リハ（音声経路テスト）
    due: -3d
    modes: [hybrid, online]
```

同梱の `templates/lifecycle.yaml` は最小構成のニュートラルなテンプレートです。
フル構成の例（ハイブリッド配信・6役体制・チェックリスト付き Issue・定期開催サイクル）は
`examples/meetup/` を参照 — **コアはコミュニティ非依存、要件はすべて設定で表現**が
ichiza の設計原則です。

`ichiza.yaml` と `lifecycle.yaml` の全パラメータは
[docs/configuration.md](docs/configuration.md) を参照してください。

## Roadmap

未実装の機能のみ載せています。実装が完了した項目はここから削除し、
機能として本文と [docs/configuration.md](docs/configuration.md) に記載します。

- [ ] `ichiza draft` — 告知記事・開催記事・司会資料の下書き生成
- [ ] `ichiza kpt` — アンケート集計 → KPT 下書き
