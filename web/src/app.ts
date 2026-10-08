import { Hono } from 'hono'

import { AccessError, authenticateAccess, parseMembers, type AccessEnv, type Operator } from './auth'
import type { EventDashboard } from './dashboard'
import { DashboardConflictError, GitHubClient, GitHubRequestError, GitHubTransportError, type DashboardTaskChanges } from './github'

interface Bindings extends AccessEnv {
  readonly ICHIZA_REPOSITORY: string
  readonly ICHIZA_GITHUB_TOKEN: string
  readonly ICHIZA_TIMEZONE?: string
}

interface AppVariables {
  readonly operator: Operator
}

interface AppEnv {
  Bindings: Bindings
  Variables: AppVariables
}

export interface DashboardRepository {
  listDashboards(): Promise<readonly EventDashboard[]>
  updateTask(issueNumber: number, taskId: string, changes: DashboardTaskChanges, expectedUpdatedAt: string): Promise<EventDashboard>
}

interface AppDependencies {
  readonly authenticate: (request: Request, env: AccessEnv) => Promise<Operator>
  readonly repository: (env: Bindings) => DashboardRepository
  readonly members: (env: Bindings) => readonly Operator[]
  readonly now: () => Date
}

const defaultDependencies: AppDependencies = {
  authenticate: authenticateAccess,
  repository: (env) =>
    new GitHubClient({ repository: env.ICHIZA_REPOSITORY, token: env.ICHIZA_GITHUB_TOKEN }),
  members: (env) => parseMembers(env.ICHIZA_MEMBERS),
  now: () => new Date(),
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
    return entities[character] ?? character
  })
}

function layout(title: string, content: string): string {
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${escapeHtml(title)} · ichiza</title><style>
  :root{font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#172033;background:#f4f6f8;line-height:1.5}*{box-sizing:border-box}body{margin:0;padding:2rem 1.25rem}main,.shell{max-width:1120px;margin:auto}nav{max-width:1120px;margin:0 auto 2.5rem;display:flex;gap:1.35rem;align-items:center}nav a{color:#2457d6;font-weight:750;text-decoration:none}nav a:first-child{font-size:1.05rem}a{color:#2457d6}.eyebrow{font-size:.72rem;letter-spacing:.14em;font-weight:850;color:#68778b;text-transform:uppercase}.hero{display:flex;justify-content:space-between;gap:1.5rem;align-items:end;margin:.55rem 0 1.7rem}.hero h1{font-size:clamp(2rem,4vw,3rem);line-height:1.08;letter-spacing:-.045em;margin:0}.hero p{color:#68778b;margin:.65rem 0 0}.pill{display:inline-flex;align-items:center;gap:.35rem;border-radius:999px;padding:.3rem .65rem;font-size:.75rem;font-weight:800;white-space:nowrap}.pill.green{background:#e4f7ec;color:#147a42}.pill.amber{background:#fff3d7;color:#9a6500}.pill.red{background:#ffe7e7;color:#b42318}.metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:.75rem;margin:0 0 1.5rem}.metric{background:#fff;border:1px solid #e0e6ed;border-radius:1rem;padding:1rem 1.1rem}.metric .label{font-size:.75rem;color:#758397;font-weight:700}.metric .value{font-size:1.65rem;font-weight:850;letter-spacing:-.04em;margin-top:.2rem}.card{background:#fff;border:1px solid #dfe5ec;border-radius:1.1rem;padding:1.4rem;box-shadow:0 10px 30px #182b4308;margin:1rem 0}.card h2{margin:0;font-size:1.15rem;letter-spacing:-.02em}.subtle,.muted{color:#758397}.progress{height:.5rem;background:#e9edf2;border-radius:99px;overflow:hidden}.progress>i{display:block;height:100%;background:#3c6df0;border-radius:inherit}.event-list{display:grid;gap:.8rem}.event{display:grid;grid-template-columns:6px 1fr auto;gap:1rem;align-items:center;padding:1.25rem;background:#fff;border:1px solid #dfe5ec;border-radius:1.05rem;box-shadow:0 10px 30px #182b4308}.event .stripe{height:100%;min-height:5.25rem;border-radius:8px;background:#3c6df0}.event h2{font-size:1.2rem;margin:0 0 .3rem}.event p{margin:0;color:#758397;font-size:.9rem}.event .right{text-align:right}.status-card{border-left:5px solid #199957;padding-left:1.15rem}.status-card.amberline{border-left-color:#d99a18}.status-head{display:flex;justify-content:space-between;gap:1rem;align-items:start}.status-head h2{font-size:1.4rem}.status-list{display:flex;flex-wrap:wrap;gap:.55rem 1.1rem;margin:1.05rem 0 .3rem;color:#405064;font-size:.9rem}.status-list span::before{content:"";display:inline-block;width:8px;height:8px;border-radius:50%;background:#199957;margin-right:8px}.status-foot{color:#758397;font-size:.82rem}.timeline{margin-top:1.7rem}.timeline table{width:100%;border-collapse:collapse}.timeline th,.timeline td{text-align:left;padding:.8rem .75rem;border-bottom:1px solid #e6ebf0;font-size:.88rem}.timeline th{color:#68778b;font-size:.75rem}.task{display:grid;grid-template-columns:1fr auto auto;gap:1rem;align-items:center;padding:1rem 0;border-top:1px solid #edf0f4}.task:first-child{border-top:0}.task-title{font-weight:800}.task-meta{font-size:.82rem;color:#758397;margin-top:.2rem}.task .actions{display:flex;gap:.5rem;align-items:center}.task button,.task select{border:1px solid #cfd7e2;background:#fff;border-radius:9px;min-height:2.25rem;padding:0 .65rem;font:inherit}.task button{font-weight:750;color:#2457d6;border-color:#b9c8f3;background:#f5f7ff}.task button.done{color:#147a42;border-color:#b6e2c9;background:#effaf3}.task select{color:#4b5a6d}.board{background:#fff;border:1px solid #dfe5ec;border-radius:1.1rem;overflow:hidden;box-shadow:0 10px 30px #182b4308}.board-head{display:flex;justify-content:space-between;align-items:center;padding:1.1rem 1.25rem;border-bottom:1px solid #e7ebf0}.board-head h2{margin:0;font-size:1rem}.board .task{padding:1rem 1.25rem;grid-template-columns:auto 1fr auto auto}.check{width:1.3rem;height:1.3rem;border:2px solid #bdc8d6;border-radius:6px}.check.checked{background:#3c6df0;border-color:#3c6df0;position:relative}.check.checked::after{content:"✓";color:#fff;font-size:.85rem;position:absolute;left:3px;top:-3px;font-weight:800}.danger{color:#b42318;font-weight:750}.empty{color:#758397;padding:1rem 0}@media(max-width:700px){body{padding:.9rem}.metrics{grid-template-columns:repeat(2,1fr)}.hero{display:block}.hero .pill{margin-top:1rem}.task,.board .task{grid-template-columns:1fr;gap:.5rem}.task .actions{justify-content:flex-start}.event{grid-template-columns:5px 1fr}.event .right{text-align:left;grid-column:2}.timeline{overflow:auto}.timeline table{min-width:42rem}}
  </style><style>
  :root{--ink:#202532;--paper:#f5f3ef;--line:#dfdfd8;--muted:#7a807f;--indigo:#405fc2;--coral:#e36c4f;--leaf:#477955}body{background:var(--paper);color:var(--ink)}nav{background:var(--ink);border-radius:14px;padding:1rem 1.25rem;margin-bottom:2.5rem;box-shadow:none}nav a{color:#bdc5d3}nav a:hover,nav a:first-child{color:#fff}a{color:var(--indigo)}.eyebrow{color:#8a7167}.hero h1{letter-spacing:-.06em}.hero p,.subtle,.muted,.event p,.task-meta,.status-foot,.empty{color:var(--muted)}.pill.green{background:#e7f1e9;color:var(--leaf)}.pill.amber{background:#fff0e9;color:#a9503b}.pill.red{background:#ffe5df;color:#a33f2d}.metric,.card,.event,.board{border-color:var(--line);border-radius:16px;box-shadow:0 8px 22px #38291b0a}.metric{background:#fff}.metric .label{color:var(--muted)}.progress{background:#e9e9e3}.progress>i{background:var(--indigo)}.event .stripe{background:var(--indigo)}.event h2{letter-spacing:-.025em}.status-card{border-left-color:var(--leaf)}.status-card.amberline{border-left-color:var(--coral)}.status-list{color:#4e5758}.status-list span::before{background:var(--leaf)}.timeline th,.timeline td{border-color:#e8e7e1}.task{border-color:#ededE7}.task button,.task select{border-color:#c9cbc5;background:#fff;color:var(--indigo)}.task button{border-color:#c3cbed;background:#f0f3ff}.task button.done{color:var(--leaf);border-color:#b9d2bd;background:#eff6f0}.task button:hover{filter:brightness(.97);transform:translateY(-1px)}.task button:active{transform:translateY(1px)}.task button:disabled{cursor:wait;opacity:.65;transform:none}.task select{color:#4e5758}.board-head{border-color:#ededE7}.check{border-color:#c2c6c4}.check.checked{background:var(--leaf);border-color:var(--leaf)}.danger{color:#a33f2d}.hero .pill{letter-spacing:.01em}.notice{display:flex;align-items:center;gap:.55rem;background:#e7f1e9;border:1px solid #b9d2bd;border-radius:12px;color:#356341;font-weight:750;padding:.8rem 1rem;margin:-.55rem 0 1.4rem}.notice::before{content:"✓";display:grid;place-items:center;width:1.25rem;height:1.25rem;border-radius:50%;background:var(--leaf);color:#fff;font-size:.8rem}@media(max-width:700px){nav{margin-left:0;margin-right:0}}
  </style></head><body><nav><a href="/">イベント</a><a href="/me">My Page</a></nav>${content}</body></html>`
}

export function dateInTimeZone(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]))
  return `${values.year}-${values.month}-${values.day}`
}

function today(dependencies: AppDependencies, bindings?: Bindings): string {
  return dateInTimeZone(dependencies.now(), bindings?.ICHIZA_TIMEZONE ?? 'Asia/Tokyo')
}

function health(dashboard: EventDashboard, date: string): string {
  const open = dashboard.tasks.filter((task) => !task.done)
  const overdue = open.filter((task) => task.due < date).length
  if (open.length === 0) return '完了'
  if (overdue > 0) return `期限超過 ${overdue}件`
  if (open.some((task) => task.due === date)) return '本日期限あり'
  return '順調'
}

function stats(dashboard: EventDashboard, date: string) {
  const completed = dashboard.tasks.filter((task) => task.done).length
  const open = dashboard.tasks.filter((task) => !task.done)
  const overdue = open.filter((task) => task.due < date).length
  const dueToday = open.filter((task) => task.due === date).length
  return { completed, total: dashboard.tasks.length, overdue, dueToday, progress: dashboard.tasks.length === 0 ? 100 : Math.round((completed / dashboard.tasks.length) * 100) }
}

function tone(state: string): string {
  if (state.startsWith('期限超過')) return 'red'
  if (state === '本日期限あり') return 'amber'
  return 'green'
}

function statusPill(label: string, status: string): string {
  return `<span class="pill ${status}">● ${escapeHtml(label)}</span>`
}

function eventCard(dashboard: EventDashboard, date: string): string {
  const { completed, total, overdue, dueToday, progress } = stats(dashboard, date)
  const state = health(dashboard, date)
  const stateClass = tone(state)
  const label = state.startsWith('期限超過') ? state : state === '本日期限あり' ? `本日期限あり · 今日の期限 ${dueToday}件` : state
  const stripe = stateClass === 'red' ? '#b42318' : stateClass === 'amber' ? '#d99a18' : '#199957'
  return `<article class="event"><div class="stripe" style="background:${stripe}"></div><div><h2><a href="/events/${encodeURIComponent(dashboard.slug)}">${escapeHtml(dashboard.title)}</a></h2><p>${escapeHtml(dashboard.date)} ・ ${completed} / ${total} 完了${overdue > 0 ? ` ・ 期限超過 ${overdue}件` : ''}</p><div class="progress" style="margin-top:.65rem"><i style="width:${progress}%;background:${stripe}"></i></div></div><div class="right">${statusPill(label, stateClass)}</div></article>`
}

function taskRow(
  dashboard: EventDashboard,
  task: EventDashboard['tasks'][number],
  date: string,
  members: readonly Operator[],
): string {
  const state = task.done ? '完了' : task.due < date ? '期限超過' : task.due === date ? '今日' : '予定'
  const stateClass = task.done ? 'green' : state === '期限超過' ? 'red' : state === '今日' ? 'amber' : 'green'
  const action = `/events/${encodeURIComponent(dashboard.slug)}/tasks/${encodeURIComponent(task.id)}`
  const hidden = `<input type="hidden" name="issueNumber" value="${dashboard.issueNumber}"><input type="hidden" name="expectedUpdatedAt" value="${escapeHtml(dashboard.updatedAt ?? '')}">`
  const options = [`<option value="">未設定</option>`, ...members.map((member) => `<option value="${escapeHtml(member.github)}"${member.github === task.assignee ? ' selected' : ''}>${escapeHtml(member.github)}</option>`)].join('')
  return `<div class="task"><div><div class="task-title">${escapeHtml(task.title)}</div><div class="task-meta ${state === '期限超過' ? 'danger' : ''}">${state} · ${escapeHtml(task.due)}${task.assignee === undefined ? '' : ` · @${escapeHtml(task.assignee)}`}</div></div><form method="post" action="${action}" onsubmit="this.querySelector('button[type=submit]').disabled=true;this.querySelector('button[type=submit]').textContent='更新中…'">${hidden}<input type="hidden" name="done" value="${task.done ? 'false' : 'true'}"><button class="${task.done ? 'done' : ''}" type="submit">${task.done ? '未完了に戻す' : '完了にする'}</button></form><form class="actions" method="post" action="${action}" onsubmit="this.querySelector('button[type=submit]').disabled=true;this.querySelector('button[type=submit]').textContent='保存中…'">${hidden}<span class="pill ${stateClass}">${escapeHtml(state)}</span><label>担当 <select name="assignee">${options}</select></label><button type="submit">保存</button></form></div>`
}

export function createApp(overrides: Partial<AppDependencies> = {}) {
  const dependencies = { ...defaultDependencies, ...overrides }
  const app = new Hono<AppEnv>()

  app.use('*', async (context, next) => {
    try {
      context.set('operator', await dependencies.authenticate(context.req.raw, context.env))
      await next()
    } catch (error) {
      if (error instanceof AccessError) return context.text(error.message, error.status)
      throw error
    }
  })

  app.onError((error, context) => {
    if (error instanceof GitHubRequestError) {
      console.error('GitHub API request failed', { status: error.status })
    } else if (error instanceof GitHubTransportError) {
      console.error('GitHub API transport failed', { detail: error.detail })
    } else {
      console.error(error)
      return context.text('Internal Server Error', 500)
    }
    return context.html(
      layout(
        'GitHub接続エラー',
        '<h1>GitHub接続エラー</h1><p>GitHubからイベント情報を取得できませんでした。しばらく待って再読み込みしてください。</p>',
      ),
      502,
    )
  })

  app.get('/', async (context) => {
    const dashboards = await dependencies.repository(context.env).listDashboards()
    const date = today(dependencies, context.env)
    const allTasks = dashboards.flatMap((dashboard) => dashboard.tasks)
    const completed = allTasks.filter((task) => task.done).length
    const overdue = allTasks.filter((task) => !task.done && task.due < date).length
    const dueToday = allTasks.filter((task) => !task.done && task.due === date).length
    const cards = dashboards.map((dashboard) => eventCard(dashboard, date)).join('')
    const content = `<main><div class="eyebrow">OPERATIONS COCKPIT</div><div class="hero"><div><h1>イベント</h1><p>運営中のイベントを、期限と進捗から確認します。</p></div>${statusPill(overdue > 0 ? '対応が必要' : 'すべて正常', overdue > 0 ? 'red' : 'green')}</div><div class="metrics"><div class="metric"><div class="label">進行中のイベント</div><div class="value">${dashboards.length}</div></div><div class="metric"><div class="label">未完了タスク</div><div class="value">${allTasks.length - completed}</div></div><div class="metric"><div class="label">期限超過</div><div class="value ${overdue > 0 ? 'danger' : ''}">${overdue}</div></div><div class="metric"><div class="label">今日の期限</div><div class="value">${dueToday}</div></div></div><div class="event-list">${cards || '<p class="empty">イベントはまだありません。</p>'}</div></main>`
    return context.html(layout('イベント', content))
  })

  app.get('/events/:slug', async (context) => {
    const dashboards = await dependencies.repository(context.env).listDashboards()
    const dashboard = dashboards.find((candidate) => candidate.slug === context.req.param('slug'))
    if (dashboard === undefined) return context.text('event not found', 404)
    const date = today(dependencies, context.env)
    const { completed, total, overdue } = stats(dashboard, date)
    const state = health(dashboard, date)
    const notice = context.req.query('saved') === '1' ? '<div class="notice" role="status">保存しました。GitHub Issueに反映されています。</div>' : ''
    const rows = dashboard.tasks.map((task) => taskRow(dashboard, task, date, dependencies.members(context.env))).join('')
    const content = `<main><div class="eyebrow">EVENT STATUS</div><div class="hero"><div><h1>${escapeHtml(dashboard.title)}</h1><p>開催日 ${escapeHtml(dashboard.date)} ・ <a href="${escapeHtml(dashboard.issueUrl)}">GitHub Dashboard Issue ↗</a></p></div>${statusPill(state, tone(state))}</div>${notice}<section class="card status-card ${overdue > 0 ? 'amberline' : ''}"><div class="status-head"><div><h2>運営タスク</h2><p class="subtle">${completed} / ${total} 完了 ・ ${overdue > 0 ? `期限超過 ${overdue}件` : '期限超過なし'}</p></div>${statusPill(total - completed > 0 ? `${total - completed}件対応中` : '完了', overdue > 0 ? 'amber' : 'green')}</div><div class="status-list">${dashboard.tasks.slice(0, 6).map((task) => `<span>${escapeHtml(task.title)}</span>`).join('')}</div><p class="status-foot">${dashboard.tasks.find((task) => !task.done)?.title ? `次の期限：${escapeHtml(dashboard.tasks.find((task) => !task.done)?.title ?? '')} ・ ${escapeHtml(dashboard.tasks.find((task) => !task.done)?.due ?? '')}` : 'すべてのタスクが完了しています'}</p></section><section class="card"><div class="board-head" style="padding:0 0 1rem;border-bottom:1px solid #e7ebf0"><h2>タスク一覧</h2><span class="subtle">期限順</span></div>${rows}</section></main>`
    return context.html(layout(dashboard.title, content))
  })

  app.get('/me', async (context) => {
    const operator = context.get('operator')
    const dashboards = await dependencies.repository(context.env).listDashboards()
    const cards = dashboards.flatMap((dashboard) => {
      const assigned = dashboard.tasks.filter((task) => task.assignee === operator.github && !task.done)
      if (assigned.length === 0) return []
      const rows = assigned.map((task) => taskRow(dashboard, task, today(dependencies, context.env), dependencies.members(context.env))).join('')
      return [`<section class="board"><div class="board-head"><h2>${escapeHtml(dashboard.title)}</h2><span class="subtle">${assigned.length}件</span></div>${rows}</section>`]
    })
    const taskCount = cards.length === 0 ? 0 : dashboards.reduce((count, dashboard) => count + dashboard.tasks.filter((task) => task.assignee === operator.github && !task.done).length, 0)
    const overdue = dashboards.flatMap((dashboard) => dashboard.tasks).filter((task) => task.assignee === operator.github && !task.done && task.due < today(dependencies, context.env)).length
    return context.html(layout('My Page', `<main><div class="eyebrow">MY PAGE</div><div class="hero"><div><h1>My Page</h1><p>@${escapeHtml(operator.github)} さんの担当タスク</p></div>${statusPill(overdue > 0 ? '期限超過あり' : '対応中', overdue > 0 ? 'red' : 'green')}</div><div class="metrics"><div class="metric"><div class="label">担当中</div><div class="value">${taskCount}</div></div><div class="metric"><div class="label">期限超過</div><div class="value ${overdue > 0 ? 'danger' : ''}">${overdue}</div></div></div><div style="display:grid;gap:1rem">${cards.join('') || '<p class="empty">未完了の担当タスクはありません。</p>'}</div></main>`))
  })

  app.post('/events/:slug/tasks/:taskId', async (context) => {
    if (context.req.header('Origin') !== new URL(context.req.url).origin) return context.text('forbidden', 403)
    const form = await context.req.parseBody()
    const issueNumber = Number(form.issueNumber)
    const expectedUpdatedAt = String(form.expectedUpdatedAt ?? '')
    const hasDone = form.done !== undefined
    const hasAssignee = form.assignee !== undefined
    const assignee = hasAssignee ? String(form.assignee) : undefined
    const changes: DashboardTaskChanges = {
      ...(hasDone ? { done: form.done === 'true' } : {}),
      ...(hasAssignee ? { assignee } : {}),
    }
    if (
      !Number.isInteger(issueNumber) ||
      issueNumber <= 0 ||
      expectedUpdatedAt === '' ||
      (!hasDone && !hasAssignee) ||
      (assignee !== undefined && assignee !== '' && !dependencies.members(context.env).some((member) => member.github === assignee))
    ) {
      return context.text('invalid task update', 400)
    }
    const repository = dependencies.repository(context.env)
    const dashboards = await repository.listDashboards()
    const dashboard = dashboards.find(
      (candidate) => candidate.slug === context.req.param('slug') && candidate.issueNumber === issueNumber,
    )
    if (dashboard === undefined) return context.text('event not found', 404)
    try {
      await repository.updateTask(issueNumber, context.req.param('taskId'), changes, expectedUpdatedAt)
      return context.redirect(`/events/${encodeURIComponent(dashboard.slug)}?saved=1`, 303)
    } catch (error) {
      if (error instanceof DashboardConflictError) {
        return context.html(layout('競合', '<h1>更新できませんでした</h1><p>GitHubで更新されたため、再読み込みしてください。</p>'), 409)
      }
      throw error
    }
  })

  return app
}

export default createApp()
