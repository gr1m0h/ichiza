# ichiza web

技術勉強会の運営者向けWebコックピットです。イベントごとのEvent Hub Issueを読み取り、イベント一覧、My Page、期限状態、Checkbox操作、担当者アサインを提供します。

## Runtime

- Cloudflare Workers
- Hono SSR
- GitHub Issuesを唯一の完了状態として利用
- 独自DBなし

## Required bindings

| Name | Purpose |
| --- | --- |
| `ICHIZA_REPOSITORY` | `owner/repository`形式の運営リポジトリ |
| `ICHIZA_GITHUB_TOKEN` | 対象リポジトリのIssues read/writeを持つfine-grained PAT |
| `ICHIZA_MEMBERS` | `[ { "email": "...", "github": "..." } ]`形式の運営者一覧 |
| `ICHIZA_TIMEZONE` | 期限状態を判定するIANA timezone（例: `Asia/Tokyo`） |
| `CF_ACCESS_TEAM_DOMAIN` | `team.cloudflareaccess.com`形式のAccess team domain |
| `CF_ACCESS_AUD` | Access application audience |

`ICHIZA_GITHUB_TOKEN`はWrangler secretとして設定し、リポジトリへ保存しません。`ICHIZA_MEMBERS`のemailはCloudflare Accessで許可した本人のemailと一致させます。

イベント詳細は「すべて」のタスクを初期表示します。メトリクスのタスク表では完了・未完了の状態と完了日を別の列に表示し、完了日のない完了タスクは「未記録」とします。
イベント詳細と My Page のタスク一覧で、完了状態、担当者（複数選択可）、Slack 通知を編集できます。
変更した行には未保存の印が付きます。行の「保存」はその行だけを Event Hub Issue に反映し、ほかの行の入力は残します。一覧下部の「まとめて保存」は、そのイベントの未保存の行すべてを反映します。「取り消す」で戻るのは未保存の入力だけです。
Slack 通知は「期日」（従来の期限判定）、「指定日」、「オフ」から選べます。
初期設定では担当者名をテキストで表示します。「担当者をメンションする」を有効にすると、Slack ID を登録した担当者にメンションを付けます。
指定日はリポジトリのタイムゾーンで判定し、その日に実行した `ichiza remind` が未完了タスクを通知対象に含めます。
同じ日に再実行すると再度対象になります。Web から保存した共同担当と通知設定は Dashboard 同期後も引き継ぎます。
運用環境では複数担当と通知設定に対応した CLI を dashboard・remind の両 workflow に適用してから Web を更新してください。
更新前に GitHub の `updated_at` を確認し、古い画面からの更新には 409 を返します。
GitHub APIは更新時の条件指定を提供しないため、確認直後の同時編集まで完全には防げない
best-effortの競合検査です。

## 結果メトリクスと横断集計

個別イベントの記録には、既存の `ichiza:event` ラベル付きEvent Hub IssueのうちClosedになったものを使います。
個別記録用のIssueは作成しません。「メトリクス」のイベント比較から、各Closed Issueのタスク状態・完了内訳・超過日数を表示します。
Closedイベントは進行中のイベント一覧とMy Pageから除きます。進行中でもイベントの「メトリクス」から、その時点の個別集計を出力できます。
定性的な入力欄・振り返り本文は設けず、ページと出力は数値・グラフ・タスク明細に限定します。

イベント横断ダッシュボードとCSV/Markdown出力は、`ichiza:metrics` ラベルの専用Issueを1回取得して描画します。
表示・年別切り替え・出力時に個別イベントの全件取得は行いません。個別の過去記録は、Insights Issue内の参照番号を使い、対象のClosed Issueだけを追加取得します。
Insights Issueが未作成なら「初回同期待ち」を表示し、画面アクセスを契機とした全件取得・Issue作成にはフォールバックしません。

Insights Issueは手動保存ではなく、次のタイミングで自動作成・更新します。Closedイベントが0件でも空の索引を作成します。

- `actions/web-deploy`：初回のWeb公開前に初期化
- `actions/new`：Event Hub Issueの作成直後に初期化
- `actions/dashboard`：完了状態のreconcile後に更新
- `actions/metrics`：定義同期後や手動の再同期用

同期コマンドは `npm run metrics:sync` です。`ICHIZA_REPOSITORY` と `ICHIZA_GITHUB_TOKEN`（Issues read/write）を渡し、必要なら `ICHIZA_TIMEZONE` を指定します。未指定時は既存索引のタイムゾーンを継承し、初回のみAsia/Tokyoを使います。
既存の`GH_REPO` / `GITHUB_REPOSITORY`、`GH_TOKEN` / `GITHUB_TOKEN`も利用できます。トークンはログへ出力しません。
同期処理だけがイベントIssueを全件取得し、全期間分の集計値を同じInsights Issueに書き戻します。内容が同じならIssueへの書き込みを省略します。
Webはこの保存済み集計を参照するため、workflowの実行待ちや失敗中は前回の集計値を表示します。更新日時を画面に表示します。

ラベルが存在しない場合は初回同期時に作成します（[Issue作成](https://docs.github.com/en/rest/issues/issues#create-an-issue)、[ラベル作成](https://docs.github.com/en/rest/issues/labels#create-a-label)）。
新規作成・reconcile・定義同期・Web公開のworkflowは、同じconcurrency groupを使って同期処理を直列化してください。
GitHubに原子的なIssue作成の排他を要求する仕組みではないため、別経路から同時に同期した場合の重複までは保証しません。重複は検出して上書きを停止します。

この変更を含むichizaのリリースを公開した後、運営リポジトリ側のAction参照を更新してください。`v0.5.1`のままでは自動同期されません。
呼び出し元では、この変更を含むリリースへAction参照とCLIの`version`入力を両方更新してください。
本文が60,000文字を超えると同期を停止し、直前の集計を保持します。個別タスク明細はInsights Issueへ複製しません。

出力だけではIssueを書き換えません。v1の指標は次の定義で、保存したタイムゾーンの暦日で比較します。

| 指標 | 定義 |
| --- | --- |
| 完了率 | 完了タスク数 / 削除を除く全タスク数。0タスクなら未計測 |
| 期日内完了率 | 期日までに完了した数 / 完了日時のある完了タスク数 |
| 完了日時の記録 | 完了日時のある数 / 完了タスク数。日時不明を別表示 |
| 平均超過日数 | 期日後に完了したタスクの超過日数の平均。日時のある完了がなければ未計測 |
| 最大超過日数 | 完了日時のある完了タスクの最大超過日数 |
| 未完了 / 期限超過 | Close時点で未完了の数 / そのうち期日を過ぎている数 |
| 再開タスク / 再開回数 | Webで未完了に戻した履歴のあるタスク数 / 操作数 |
| 削除 | Dashboardの削除マーカーの数。完了率などの分母には含めない |

全体の率はタスク数、平均超過日数は期日後完了のタスク数で重み付けします。
着手・待ち時間・工数、GitHubで直接変更した時刻、削除前のタスク詳細・履歴は計測していません。
Insights Issueの保存形式は `ichiza-metrics:v1` です。本文は自動生成され、再保存時に置き換わります。

## Local verification

```sh
cp .dev.vars.example .dev.vars
npm install
npm test
npm run check
npm run test:coverage
npx wrangler deploy --dry-run
```

ローカル実行でも有効なCloudflare Access JWTが必要です。認証を無効化する開発モードは用意していません。

## Deployment order

1. `actions/web-deploy`を一度実行し、無料の`<worker>.<account>.workers.dev` URLを作成する。この時点ではAccess設定が空なので、Worker自身が全アクセスを拒否します。
2. Cloudflare dashboardの Workers & Pages → 対象Worker → Access から **Protect this Worker behind Access** を有効化する。
3. 個別emailで許可する運営者をAccess policyへ登録する。
4. 発行されたteam domainとapplication audienceを設定し、deployを再実行する。

AccessとWorker内の`ICHIZA_MEMBERS`の両方を通った運営者だけがデータへアクセスできます。
独自ドメインは不要です。必要になった場合だけ、後から同じWorkerへCustom Domainを追加できます。

`actions/web-deploy`には次のsecret/envが必要です。

- `CLOUDFLARE_API_TOKEN`: 対象Workerを編集できるCloudflare API token
- `CLOUDFLARE_ACCOUNT_ID`: Cloudflare account ID
- `ICHIZA_GITHUB_TOKEN`: 運営リポジトリのIssues read/writeを持つfine-grained PAT

Worker 名と非公開でない bindings は、一時的な設定ファイルにまとめて Wrangler に渡します。
一時ファイルはデプロイの成功・失敗のどちらでも削除し、GitHub token は別の secrets file にだけ格納します。

Cloudflare Dashboard で変更した設定との差分は、既定では `--strict` によりデプロイを停止します。
運営者の追加など、workflow の入力で既存設定を意図的に更新するときは、差分を確認してから
`actions/web-deploy` の入力に `allow-config-updates: "true"` を指定してください。
この入力は Wrangler の設定差分による停止を解除するため、対象 Worker の設定全体を確認してください。

### Issueの呼び方

| 名称 | 単位 | 役割 |
| --- | --- | --- |
| ichiza Event Hub | イベントごとに1件 | タスク・期日・担当者・完了日時・完了と再開の履歴を保存する元データ。Close後も同じIssueを個別記録として参照する。 |
| ichiza Insights | リポジトリに1件 | Close済みイベントの集計値と元Issueへの参照を保存する。運営メトリクス画面の取得元として、同じIssueを自動更新する。 |

新規Issueのタイトルは、イベントごとに `[ichiza] Event Hub｜<イベント名>`、横断集計は `[ichiza] Insights` です。画面リンクは `Event Hub Issue ↗` / `Insights Issue ↗` と表示します。
既存Issueの識別はタイトルではなく、従来のラベルと本文マーカーを使います。名称変更による再作成やデータ形式の変更はありません。

## デザインとブランド

ichiza-docsと同じ赤（ライト `#b03a2e`、ダーク `#e88a7d`）、システムフォント、ライト／ダークの背景色を使います。初期テーマはOSに従い、ヘッダーの切り替え操作を端末に保存します。
ロゴとfaviconはどちらも `/img/logo.svg` を参照し、`src/brand.ts` にdocsの `static/img/logo.svg` をそのまま収録しています。ロゴ変更時は両方のSVGを同期してください。ブランド画像だけを認証前に配信し、イベントやメトリクスには従来どおりCloudflare Accessが必要です。
期間は選択時に反映し、CSV／Markdownは選択中の年を引き継ぐダウンロードボタンとして表示します。JavaScriptを使えない場合は「適用」ボタンを表示します。
