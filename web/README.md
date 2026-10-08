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

イベント詳細とMy Pageでは、Cloudflare Accessで認証された運営者が `ICHIZA_MEMBERS` に登録されたGitHub loginから担当者を選択できます。
「未設定」を選ぶと担当を外せます。保存するとDashboard Issueの対象タスクに表示される `@login` とJSONメタデータを同時に更新します。
完了状態と担当者の更新前にGitHubの `updated_at` を確認し、古い画面からの更新は409にします。
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
