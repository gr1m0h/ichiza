# ichiza web

技術勉強会の運営者向けWebコックピットです。イベントごとのDashboard Issueを読み取り、イベント一覧、My Page、期限状態、Checkbox操作、担当者アサインを提供します。

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

イベント詳細と My Page のタスク一覧で、完了状態、担当者（複数選択可）、Slack 通知を編集できます。
変更した行には「未保存」と表示されます。「このタスクを保存」はその行だけを Dashboard Issue に反映し、ほかの行の入力は残します。一覧下部の「すべての変更を保存」は、そのイベントの未保存の行すべてを反映します。「変更を取り消す」で戻るのは未保存の入力だけです。
Slack 通知は「期日に合わせて通知」（従来の期限判定）、「指定日だけ通知」、「通知しない」から選べます。
初期設定では担当者名をテキストで表示します。「担当者をメンションする」を有効にすると、Slack ID を登録した担当者にメンションを付けます。
指定日はリポジトリのタイムゾーンで判定し、その日に実行した `ichiza remind` が未完了タスクを通知対象に含めます。
同じ日に再実行すると再度対象になります。Web から保存した共同担当と通知設定は Dashboard 同期後も引き継ぎます。
運用環境では複数担当と通知設定に対応した CLI を dashboard・remind の両 workflow に適用してから Web を更新してください。
更新前に GitHub の `updated_at` を確認し、古い画面からの更新には 409 を返します。
GitHub APIは更新時の条件指定を提供しないため、確認直後の同時編集まで完全には防げない
best-effortの競合検査です。

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
