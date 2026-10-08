import { describe, expect, it, vi } from 'vitest'

import type { EventDashboard } from './dashboard'
import { DashboardConflictError, GitHubRequestError, GitHubTransportError } from './github'
import { createApp, dateInTimeZone, type DashboardRepository } from './app'
import { AccessError } from './auth'

const dashboard: EventDashboard = {
  issueNumber: 42,
  issueUrl: 'https://github.example/issues/42',
  updatedAt: '2026-10-07T01:00:00Z',
  slug: 'hiroshima-3',
  title: 'SRE Lounge Hiroshima #3',
  date: '2026-11-01',
  body: 'dashboard body',
  tasks: [
    { id: 'venue', title: '会場を確定する', due: '2026-10-06', assignee: 'alice', labels: [], done: false },
    { id: 'announce', title: '参加者へ告知する', due: '2026-10-10', assignee: 'bob', labels: [], done: false },
  ],
}

function setup(repository?: DashboardRepository) {
  const repo =
    repository ??
    ({
      listDashboards: vi.fn().mockResolvedValue([dashboard]),
      updateTask: vi.fn().mockResolvedValue(dashboard),
    } satisfies DashboardRepository)
  const app = createApp({
    authenticate: vi.fn().mockResolvedValue({ email: 'alice@example.com', github: 'alice' }),
    repository: () => repo,
    now: () => new Date('2026-10-07T00:00:00Z'),
  })
  return { app, repo }
}

describe('ichiza web', () => {
  it('uses the configured timezone when UTC and local dates differ', () => {
    expect(dateInTimeZone(new Date('2026-10-06T15:30:00Z'), 'Asia/Tokyo')).toBe('2026-10-07')
    expect(dateInTimeZone(new Date('2026-10-06T15:30:00Z'), 'America/Los_Angeles')).toBe('2026-10-06')
  })

  it('shows event health and progress on the event list', async () => {
    const { app } = setup()

    const response = await app.request('http://localhost/')
    const page = await response.text()

    expect(response.status).toBe(200)
    expect(page).toContain('SRE Lounge Hiroshima #3')
    expect(page).toContain('2026-11-01')
    expect(page).toContain('期限超過 1件')
    expect(page).toContain('0 / 2 完了')
  })

  it('shows only the signed-in operator tasks on My Page', async () => {
    const { app } = setup()

    const page = await (await app.request('http://localhost/me')).text()

    expect(page).toContain('会場を確定する')
    expect(page).not.toContain('参加者へ告知する')
  })

  it('renders complete, due-today, on-track, and empty event states', async () => {
    const complete = { ...dashboard, slug: 'complete', title: 'Complete', tasks: dashboard.tasks.map((task) => ({ ...task, done: true })) }
    const today = { ...dashboard, slug: 'today', title: 'Today', tasks: [{ ...dashboard.tasks[0]!, due: '2026-10-07' }] }
    const future = { ...dashboard, slug: 'future', title: 'Future', tasks: [{ ...dashboard.tasks[0]!, due: '2026-10-08' }] }
    const repo: DashboardRepository = {
      listDashboards: vi.fn().mockResolvedValue([complete, today, future]),
      updateTask: vi.fn(),
    }
    const { app } = setup(repo)

    const page = await (await app.request('http://localhost/')).text()

    expect(page).toContain('完了')
    expect(page).toContain('本日期限あり')
    expect(page).toContain('順調')

    const emptyRepo: DashboardRepository = {
      listDashboards: vi.fn().mockResolvedValue([]),
      updateTask: vi.fn(),
    }
    const emptyPage = await (await setup(emptyRepo).app.request('http://localhost/')).text()
    expect(emptyPage).toContain('イベントはまだありません')
  })

  it('renders event details and task action states', async () => {
    const detailed: EventDashboard = {
      ...dashboard,
      updatedAt: undefined,
      tasks: [
        { ...dashboard.tasks[0]!, done: true },
        { ...dashboard.tasks[1]!, due: '2026-10-07', assignee: undefined },
      ],
    }
    const repo: DashboardRepository = {
      listDashboards: vi.fn().mockResolvedValue([detailed]),
      updateTask: vi.fn(),
    }
    const { app } = setup(repo)

    const response = await app.request('http://localhost/events/hiroshima-3')
    const page = await response.text()

    expect(response.status).toBe(200)
    expect(page).toContain('GitHub Dashboard Issue')
    expect(page).toContain('2026-11-01')
    expect(page).toContain('未完了に戻す')
    expect(page).toContain('今日')
  })

  it('returns useful empty and not-found pages', async () => {
    const { app } = setup()

    expect((await app.request('http://localhost/events/missing')).status).toBe(404)

    const emptyRepo: DashboardRepository = {
      listDashboards: vi.fn().mockResolvedValue([]),
      updateTask: vi.fn(),
    }
    const myPage = await (await setup(emptyRepo).app.request('http://localhost/me')).text()
    expect(myPage).toContain('未完了の担当タスクはありません')
  })

  it('updates a checkbox after same-origin validation', async () => {
    const { app, repo } = setup()
    const form = new URLSearchParams({ done: 'true', issueNumber: '42', expectedUpdatedAt: dashboard.updatedAt ?? '' })

    const response = await app.request('http://localhost/events/hiroshima-3/tasks/venue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: 'http://localhost' },
      body: form,
    })

    expect(response.status).toBe(303)
    expect(repo.updateTask).toHaveBeenCalledWith(42, 'venue', true, dashboard.updatedAt)
  })

  it('returns a guided conflict page instead of overwriting GitHub changes', async () => {
    const repo: DashboardRepository = {
      listDashboards: vi.fn().mockResolvedValue([dashboard]),
      updateTask: vi.fn().mockRejectedValue(new DashboardConflictError()),
    }
    const { app } = setup(repo)
    const form = new URLSearchParams({ done: 'true', issueNumber: '42', expectedUpdatedAt: dashboard.updatedAt ?? '' })

    const response = await app.request('http://localhost/events/hiroshima-3/tasks/venue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: 'http://localhost' },
      body: form,
    })

    expect(response.status).toBe(409)
    expect(await response.text()).toContain('GitHubで更新されたため、再読み込みしてください')
  })

  it('rejects cross-origin mutations', async () => {
    const { app, repo } = setup()

    const response = await app.request('http://localhost/events/hiroshima-3/tasks/venue', {
      method: 'POST',
      headers: { Origin: 'https://evil.example.com' },
    })

    expect(response.status).toBe(403)
    expect(repo.updateTask).not.toHaveBeenCalled()
  })

  it('rejects invalid or mismatched task updates', async () => {
    const { app, repo } = setup()

    const invalid = await app.request('http://localhost/events/hiroshima-3/tasks/venue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: 'http://localhost' },
      body: new URLSearchParams({ issueNumber: '0' }),
    })
    expect(invalid.status).toBe(400)

    const mismatch = await app.request('http://localhost/events/other/tasks/venue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: 'http://localhost' },
      body: new URLSearchParams({ issueNumber: '42', expectedUpdatedAt: dashboard.updatedAt ?? '' }),
    })
    expect(mismatch.status).toBe(404)
    expect(repo.updateTask).not.toHaveBeenCalled()
  })

  it('returns the authentication failure status', async () => {
    const { repo } = setup()
    const app = createApp({
      authenticate: vi.fn().mockRejectedValue(new AccessError(403, 'operator is not allowed')),
      repository: () => repo,
    })

    const response = await app.request('http://localhost/')

    expect(response.status).toBe(403)
    expect(await response.text()).toBe('operator is not allowed')
  })

  it.each([
    {
      error: new GitHubRequestError(403),
      log: ['GitHub API request failed', { status: 403 }],
    },
    {
      error: new GitHubTransportError(new TypeError('Fetch failed'), 'secret'),
      log: ['GitHub API transport failed', { detail: 'TypeError: Fetch failed' }],
    },
  ])('returns a guided upstream error page for $error.name', async ({ error, log }) => {
    const repo: DashboardRepository = {
      listDashboards: vi.fn().mockRejectedValue(error),
      updateTask: vi.fn(),
    }
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    const response = await setup(repo).app.request('http://localhost/')
    const page = await response.text()

    expect(response.status).toBe(502)
    expect(page).toContain('GitHubからイベント情報を取得できませんでした')
    expect(consoleError).toHaveBeenCalledWith(...log)
    consoleError.mockRestore()
  })
})
