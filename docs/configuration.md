# 設定リファレンス

コミュニティ固有の要件はすべて 2 つの設定ファイルで表現します。コードの変更は不要です。

| ファイル | 役割 |
|---|---|
| `ichiza.yaml` | コミュニティの既定値（開催形態・会場・役割・配信など）。旗揚げ時に `event.yaml` の雛形へ反映される |
| `templates/lifecycle.yaml` | タスクの雛形。開催日からのオフセットで定義し、旗揚げ時に期限つきタスク（`tasks.yaml` + GitHub Issues）へ展開される |

どちらも省略可能です。`ichiza.yaml` がない場合は内蔵のフォールバック値
（onsite / organizer 1人 / `templates/lifecycle.yaml`）で動きます。

`lifecycle.yaml` だけ `templates/` 配下にあるのは、設定（`ichiza.yaml`）ではなく
旗揚げのたびに展開される**テンプレート**であり、用途別に複数置けるためです
（例: 通常回と LT 大会。`ichiza new --lifecycle templates/lt-night.yaml` または
`actions/new` の `lifecycle` input で切り替え）。

## ichiza.yaml

リポジトリのルートに置きます。フル構成の例:

```yaml
lifecycle: templates/lifecycle.yaml   # lifecycle テンプレートのパス
events_dir: events                    # イベントディレクトリの生成先

defaults:                             # 旗揚げ時の event.yaml 雛形に反映される既定値
  mode: hybrid                        # onsite | hybrid | online
  venue:
    name: 〇〇ビル 3F セミナールーム   # 会場名（省略可）
    capacity: 30                      # 定員
    facilities: [wifi, projector, hdmi] # 設備（自由記述のリスト）
    checkin: 名簿                     # 受付方法
  roles: [mc, reception, photographer, timekeeper, director, afterparty] # 運営役割
  streaming_role: streaming           # hybrid/online のとき roles に追加される配信担当
  streaming:
    platform: streamyard              # 配信サービス
    camera: [smartphone]              # カメラ機材
    # youtube_url:                    # アーカイブ URL（開催後に記入）
    # audio:                          # 音声経路のメモ
  timetable:                          # タイムテーブルの雛形
    - { start: "19:00", title: "オープニング" }
    - { start: "19:10", title: "セッション1", speaker: "" }

notifier:
  type: slack                         # 通知 adapter
registry:
  type: connpass                      # イベント募集ページ adapter
  templates:                          # 募集ページ原稿のテンプレ（省略時は内蔵デフォルト）
    page: templates/registry/page.md
    speaker: templates/registry/speaker.md
sns:
  x:
    mode: intent                      # X 告知の方式
```

### トップレベル

| キー | 意味 | 省略時 |
|---|---|---|
| `lifecycle` | lifecycle テンプレートのパス | `templates/lifecycle.yaml` |
| `events_dir` | `events/<slug>/` を生成する場所 | `events` |
| `defaults` | 旗揚げ時の既定値（下記） | 最小構成 |
| `notifier.type` | 通知先 adapter。現状 `slack` のみ | `slack` |
| `registry.type` | 募集ページ adapter。現状 `connpass` のみ | `connpass` |
| `registry.templates.page` | 募集ページ原稿（全文）のテンプレパス | 内蔵デフォルト |
| `registry.templates.speaker` | 登壇者1名分セクションのテンプレパス | 内蔵デフォルト |
| `sns.x.mode` | X 告知の方式。現状 `intent`（投稿画面リンクの半自動方式）のみ | `intent` |

> `notifier.type` / `sns` は現状**宣言のみ**で、値を変えても動作は変わりません
> （remind の Slack 通知・announce タスクへの X intent リンクが現在の実装です）。
> `registry.type` は `ichiza watch` の adapter 選択に使われます（現状 `connpass` のみ。
> それ以外の値はエラー）。discord / doorkeeper / X API など adapter の追加は Roadmap 項目です。

### defaults

旗揚げ時に `events/<slug>/event.yaml` の雛形へコピーされる値です。
**旗揚げ後のイベントには影響しません**（event.yaml が SSoT。個別イベントの変更は
event.yaml を直接編集します）。

| キー | 意味 |
|---|---|
| `mode` | 既定の開催形態。`onsite` / `hybrid` / `online`。Run workflow のフォームで毎回上書き可能 |
| `venue` | 会場情報。`name` / `capacity` / `facilities`（リスト）/ `checkin`。**online のイベントでは雛形から省かれる** |
| `roles` | 運営役割のリスト。雛形では「役割名 → 担当者（空欄）」の割り当て表になる。ワンオペなら `[organizer]` で十分 |
| `streaming_role` | **hybrid / online のとき**だけ `roles` に追加される配信担当の役割名 |
| `streaming` | 配信設定。`platform` / `camera`（リスト）/ `youtube_url` / `audio`。**onsite のイベントでは雛形から省かれる** |
| `timetable` | タイムテーブルの雛形。各行は `start`（時刻文字列）/ `title` / `speaker`（省略可） |

## lifecycle.yaml

タスクの雛形です。`tasks` のリストだけを持ち、各タスクは開催日からの
オフセットで期限を定義します。

```yaml
tasks:
  - title: 会場確定・確保          # タスク名（Issue タイトルになる）
    due: -35d                     # 開催日からのオフセット
    labels: [venue]               # ラベル
    modes: [onsite, hybrid]       # このモードのときだけ展開（省略 = 全モード）
    body: |                       # Issue 本文（省略可。チェックリスト推奨）
      確認項目:
      - [ ] 収容人数
      - [ ] Wi-Fi
  - { title: イベントページ作成・公開, due: -30d, labels: [announce] }
  - { title: お礼, due: 1d, labels: [followup] }
```

| フィールド | 意味 |
|---|---|
| `title` | タスク名。Issue は `【〜MM/DD】タスク名` の形式で作られる |
| `due` | 開催日からのオフセット。`-30d`（30日前）/ `-2w`（2週間前）/ `0d`（当日）/ `3d`(3日後)。`d` = 日、`w` = 週 |
| `labels` | Issue に付くラベル。**`announce` は特別扱い**: リマインド通知に X の投稿画面を開くリンクが付く |
| `modes` | 展開条件。指定したモード（`onsite` / `hybrid` / `online`）のイベントのときだけタスク化される。省略時は常に展開 |
| `body` | Issue 本文（markdown）。当日チェックリストや確認項目を書いておくと Issue がそのまま作業手順書になる |

### 設計のヒント

- **最長オフセットが旗揚げの締切を決めます**。`-35d` のタスクがあるなら、開催日の
  35 日以上前に旗揚げしないと生成直後から期限超過になります
- 展開されたタスクは期限順にソートされ、1 イベント = 1 マイルストーンで Issues 化されます
- 振り返り（KPT）で出た運営改善は lifecycle.yaml に反映すると次回の旗揚げから自動で効きます
- 定期開催なら「次回イベントの旗揚げ」タスク（`due: 105d` など正のオフセット）を
  入れておくと、開催サイクル自体がリマインドに乗ります

## 募集ページ原稿テンプレート（registry.templates）

connpass には書き込み API がないため、ichiza は「connpass の**コピーして新規作成** →
生成された原稿をペースト → 公開」まで人間の作業を圧縮するアプローチを取ります。
原稿は `ichiza registry` が event.yaml（SSoT）から生成し、GitHub Actions では
job summary に出力されます:

- 旗揚げ時（`actions/new`）: 雛形の内容で全文を生成
- event.yaml 更新後（`actions/registry` を Run workflow で実行）: 全文を再生成。
  登壇者を追加したときも、公開済みページの本文へ**全文を貼り直す**運用が
  差分追記より簡単で崩れません（connpass の編集は本文の全置換のため）

文面はコミュニティごとに違うため、テンプレートは運営リポジトリ側
（ichiza-starter 由来）に置き、`registry.templates` でパスを指定します。
省略時は内蔵のニュートラルなデフォルトが使われます。
形式は Go の [text/template](https://pkg.go.dev/text/template) を使った
markdown / テキストです。

## 申込数ウォッチ（ichiza watch）

公開後の申込状況は `ichiza watch` が connpass API v2 で取得します
（読み取り専用。API キーは connpass サポートへの申請制で、環境変数
`CONNPASS_API_KEY` で渡します）:

- 対象は `events/*/event.yaml` のうち **開催日が今日以降**かつ `connpass_url` が
  設定されているイベント。`--slug` 指定時はそのイベントだけ（開催済みも可）
- 出力は申込数 / 定員（充足率）・補欠数・受付状態。`--notify slack` で
  remind と同じ Slack Webhook に送れます（`actions/watch` を cron に載せる想定）
- `connpass_url` 未設定のイベントは通知内で ⚠️ として報告されます
  （静かに落とすと「全部見えている」ように誤読されるため）
- **公開中のイベントが 1 件もない間は実質休止**: cron は動きますが Slack へは
  送らず、実行ログにだけ状況を残します（公開待ちの ⚠️ を毎朝流しても
  remind の「connpassページ公開」タスクと重複するだけのため）。
  `connpass_url` を event.yaml に追記した翌朝から自動で通知が始まります

### page テンプレートの変数

| 変数 | 内容 |
|---|---|
| `{{.Title}}` / `{{.Slug}}` / `{{.Mode}}` | イベント基本情報 |
| `{{.Date}}` | `YYYY-MM-DD` |
| `{{.DateJP}}` | `2026年11月28日（土）`（parse 不能時は `.Date` のまま） |
| `{{.Venue}}` | 会場（`.Name` / `.Capacity` / `.Facilities` / `.Checkin`。ないときは nil） |
| `{{.Streaming}}` | 配信（`.Platform` / `.YouTubeURL` など。ないときは nil） |
| `{{.ConnpassURL}}` | event.yaml の `connpass_url` |
| `{{.TimetableTable}}` | タイムテーブルの markdown 表（合成済み） |
| `{{.SpeakersSection}}` | speaker テンプレートを全登壇者に適用して連結したもの |
| `{{.Timetable}}` / `{{.Speakers}}` | 生データ（`range` で独自レイアウトを組む場合） |

### speaker テンプレートの変数

| 変数 | 内容 |
|---|---|
| `{{.Handle}}` / `{{.SNS}}` / `{{.Bio}}` / `{{.SessionTitle}}` / `{{.Remote}}` | event.yaml の `speakers:` の生データ |
| `{{.DisplayName}}` | Handle + リモート登壇の注記 |
| `{{.DisplaySessionTitle}}` | SessionTitle（未定なら「タイトル未定」） |

例: [`examples/meetup/registry/`](../examples/meetup/registry/)

## 実例

- 最小構成（同梱フォールバック相当）: [`templates/lifecycle.yaml`](../templates/lifecycle.yaml)
- フル構成（ハイブリッド配信・6役体制・チェックリスト付き Issue・定期開催サイクル）:
  [`examples/meetup/`](../examples/meetup/)
