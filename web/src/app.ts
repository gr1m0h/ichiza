import { Hono } from 'hono'

import { AccessError, authenticateAccess, type AccessEnv, type Operator } from './auth'
import type { EventDashboard } from './dashboard'
import { DashboardConflictError, GitHubClient } from './github'

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
  updateTask(issueNumber: number, taskId: string, done: boolean, expectedUpdatedAt: string): Promise<EventDashboard>
}

interface AppDependencies {
  readonly authenticate: (request: Request, env: AccessEnv) => Promise<Operator>
  readonly repository: (env: Bindings) => DashboardRepository
  readonly now: () => Date
}

const defaultDependencies: AppDependencies = {
  authenticate: authenticateAccess,
  repository: (env) =>
    new GitHubClient({ repository: env.ICHIZA_REPOSITORY, token: env.ICHIZA_GITHUB_TOKEN }),
  now: () => new Date(),
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
    return entities[character] ?? character
  })
}

function layout(title: string, content: string): string {
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${escapeHtml(title)} · ichiza</title><style>body{font-family:system-ui,sans-serif;max-width:960px;margin:auto;padding:1.25rem;color:#172033;background:#f7f8fb}nav{display:flex;gap:1rem;margin-bottom:2rem}a{color:#2457d6}.card{background:white;border:1px solid #dfe3ec;border-radius:12px;padding:1rem;margin:1rem 0}.danger{color:#b42318;font-weight:700}.muted{color:#667085}.task{display:flex;gap:.75rem;align-items:flex-start;padding:.7rem 0;border-top:1px solid #eef0f4}.task:first-child{border:0}button{min-height:2.5rem}.badge{display:inline-block;padding:.15rem .5rem;border-radius:999px;background:#eef2ff;margin-right:.4rem}@media(max-width:600px){body{padding:.8rem}}</style></head><body><nav><a href="/">イベント</a><a href="/me">My Page</a></nav>${content}</body></html>`
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

function eventCard(dashboard: EventDashboard, date: string): string {
  const completed = dashboard.tasks.filter((task) => task.done).length
  const state = health(dashboard, date)
  const stateClass = state.startsWith('期限超過') ? 'danger' : ''
  return `<article class="card"><h2><a href="/events/${encodeURIComponent(dashboard.slug)}">${escapeHtml(dashboard.title)}</a></h2><p class="muted">開催日 ${escapeHtml(dashboard.date)}</p><p><span class="badge ${stateClass}">${escapeHtml(state)}</span>${completed} / ${dashboard.tasks.length} 完了</p></article>`
}

function taskRow(dashboard: EventDashboard, task: EventDashboard['tasks'][number], date: string): string {
  const state = task.done ? '完了' : task.due < date ? '期限超過' : task.due === date ? '今日' : '予定'
  return `<div class="task"><form method="post" action="/events/${encodeURIComponent(dashboard.slug)}/tasks/${encodeURIComponent(task.id)}"><input type="hidden" name="issueNumber" value="${dashboard.issueNumber}"><input type="hidden" name="expectedUpdatedAt" value="${escapeHtml(dashboard.updatedAt ?? '')}"><input type="hidden" name="done" value="${task.done ? 'false' : 'true'}"><button type="submit">${task.done ? '未完了に戻す' : '完了にする'}</button></form><div><strong>${escapeHtml(task.title)}</strong><br><span class="${state === '期限超過' ? 'danger' : 'muted'}">${state} · ${escapeHtml(task.due)}${task.assignee === undefined ? '' : ` · @${escapeHtml(task.assignee)}`}</span></div></div>`
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

  app.get('/', async (context) => {
    const dashboards = await dependencies.repository(context.env).listDashboards()
    const cards = dashboards.map((dashboard) => eventCard(dashboard, today(dependencies, context.env))).join('')
    return context.html(layout('イベント', `<h1>イベント</h1>${cards || '<p>イベントはまだありません。</p>'}`))
  })

  app.get('/events/:slug', async (context) => {
    const dashboards = await dependencies.repository(context.env).listDashboards()
    const dashboard = dashboards.find((candidate) => candidate.slug === context.req.param('slug'))
    if (dashboard === undefined) return context.text('event not found', 404)
    const rows = dashboard.tasks.map((task) => taskRow(dashboard, task, today(dependencies, context.env))).join('')
    const content = `<h1>${escapeHtml(dashboard.title)}</h1><p class="muted">開催日 ${escapeHtml(dashboard.date)}</p><p><a href="${escapeHtml(dashboard.issueUrl)}">GitHub Dashboard Issue</a></p><section class="card">${rows}</section>`
    return context.html(layout(dashboard.title, content))
  })

  app.get('/me', async (context) => {
    const operator = context.get('operator')
    const dashboards = await dependencies.repository(context.env).listDashboards()
    const cards = dashboards.flatMap((dashboard) => {
      const assigned = dashboard.tasks.filter((task) => task.assignee === operator.github && !task.done)
      if (assigned.length === 0) return []
      const rows = assigned.map((task) => taskRow(dashboard, task, today(dependencies, context.env))).join('')
      return [`<section class="card"><h2>${escapeHtml(dashboard.title)}</h2>${rows}</section>`]
    })
    return context.html(layout('My Page', `<h1>My Page</h1><p>${escapeHtml(operator.github)} さんの担当</p>${cards.join('') || '<p>未完了の担当タスクはありません。</p>'}`))
  })

  app.post('/events/:slug/tasks/:taskId', async (context) => {
    if (context.req.header('Origin') !== new URL(context.req.url).origin) return context.text('forbidden', 403)
    const form = await context.req.parseBody()
    const issueNumber = Number(form.issueNumber)
    const expectedUpdatedAt = String(form.expectedUpdatedAt ?? '')
    const done = form.done === 'true'
    if (!Number.isInteger(issueNumber) || issueNumber <= 0 || expectedUpdatedAt === '') {
      return context.text('invalid task update', 400)
    }
    const repository = dependencies.repository(context.env)
    const dashboards = await repository.listDashboards()
    const dashboard = dashboards.find(
      (candidate) => candidate.slug === context.req.param('slug') && candidate.issueNumber === issueNumber,
    )
    if (dashboard === undefined) return context.text('event not found', 404)
    try {
      await repository.updateTask(issueNumber, context.req.param('taskId'), done, expectedUpdatedAt)
      return context.redirect(`/events/${encodeURIComponent(dashboard.slug)}`, 303)
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
