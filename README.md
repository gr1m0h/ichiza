# ichiza（一座）

Community event operations as Code.

勉強会・ミートアップの運営を「一座の公演」に見立てて、
イベント定義（event.yaml）から告知・リマインド・タスク管理を派生させる
ワンオペ向け運営CLIです。サーバー不要、GitHub Actions が唯一のランタイム。

## 思想

- **Single Source of Truth**: すべては `events/<slug>/event.yaml` から派生する
- **判断だけを人間に残す**: 記憶と定型作業はシステムへ、意思決定だけ運営へ
- **サーバーを持たない**: 運用対象を増やさないことが持続可能性

## 配布モデル（tfaction スタイル）

ichiza は「インストールする CLI」ではなく「導入する GitHub Actions プラットフォーム」です。

1. **starter テンプレートから運営リポジトリを作成**
   （`gh repo create <owner>/<repo> --template gr1m0h/ichiza-starter`）
2. 生成されたリポジトリには workflows / Issue Forms / `ichiza.yaml` が配線済み
3. 新イベントの旗揚げは GitHub UI の **Run workflow ボタン**から
   （スマホの GitHub アプリからも実行可能 — CLI 知識ゼロの共同運営者でも使える）
4. バージョンは `gr1m0h/ichiza/actions/*@v0` のタグ参照で固定、Renovate で追従

```text
gr1m0h/ichiza          # 本体: CLI + composite actions
├── actions/setup      # CLI インストール
├── actions/new        # 旗揚げ（scaffold → PR + Issues）
└── actions/remind     # 期限リマインド（cron）

gr1m0h/ichiza-starter  # コミュニティが複製するテンプレート（template repository）
├── .github/workflows/ichiza-new.yml     # Run workflow ボタン
├── .github/workflows/ichiza-remind.yml  # 毎朝の期限チェック
├── .github/ISSUE_TEMPLATE/speaker.yml   # 登壇者情報 Issue Form
├── ichiza.yaml                          # root 設定（notifier/registry adapter）
└── templates/lifecycle.yaml             # ライフサイクル定義
```

## Quickstart

```console
$ go install github.com/gr1m0h/ichiza@latest
$ ichiza new --slug tokyo-3 --title "Your Meetup #3" --date 2026-11-28
# 既定値（開催形態・役割・会場・配信設定）は ichiza.yaml の defaults で定義
$ ichiza new ... --issues   # gh CLI 経由で期限つき Issues も一括生成

$ ichiza remind                   # 期限超過 + 7日以内のタスクを表示
$ ichiza remind --notify slack    # SLACK_WEBHOOK_URL に通知（cron 用）
$ ichiza speakers                 # 登壇者 Issue Form → connpass 掲載文
$ ichiza speakers --apply --slug tokyo-3   # event.yaml にも反映
```

生成物:

- `events/<slug>/event.yaml` — イベント定義の雛形
- `events/<slug>/tasks.yaml` — lifecycle テンプレから逆算した期限つきタスク
- （`--issues`）マイルストーン + 期限入りタイトルの GitHub Issues

`remind` は announce ラベルのタスクに X の投稿画面を開く intent URL を添えるので、
通知からワンタップで告知ポストまで済む（`sns.x.mode: intent`）。

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
フル構成の例（ハイブリッド配信・5役体制・チェックリスト付き Issue・定期開催サイクル）は
`examples/meetup/` を参照 — **コアはコミュニティ非依存、要件はすべて設定で表現**が
ichiza の設計原則です。

## Roadmap

- [x] `ichiza remind` — cron からの期限チェック + Slack 通知（X intent URL 添付）
- [x] `ichiza speakers` — GitHub Issue Forms から登壇者情報を収集・connpass 掲載文生成
- [ ] `ichiza watch` — connpass API v2 で申込数ウォッチ（adapter 化して他サービス対応）
- [ ] `ichiza draft` — 告知記事・開催記事・司会資料の下書き生成
- [ ] `ichiza kpt` — アンケート集計 → KPT 下書き
