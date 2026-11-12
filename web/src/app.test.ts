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
    { id: 'venue', title: '会場を確定する', due: '2026-10-06', assignees: ['bob', 'alice'], labels: [], done: false },
    { id: 'announce', title: '参加者へ告知する', due: '2026-10-10', assignees: ['bob'], labels: [], done: false },
  ],
}

function setup(repository?: DashboardRepository) {
  const repo =
    repository ??
    ({
      listDashboards: vi.fn().mockResolvedValue([dashboard]),
      updateTasks: vi.fn().mockResolvedValue(dashboard),
    } satisfies DashboardRepository)
  const app = createApp({
    authenticate: vi.fn().mockResolvedValue({ email: 'alice@example.com', github: 'alice' }),
    repository: () => repo,
    members: () => [
      { email: 'alice@example.com', github: 'alice' },
      { email: 'bob@example.com', github: 'bob' },
    ],
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
      updateTasks: vi.fn(),
    }
    const { app } = setup(repo)

    const page = await (await app.request('http://localhost/')).text()

    expect(page).toContain('完了')
    expect(page).toContain('本日期限あり')
    expect(page).toContain('順調')

    const emptyRepo: DashboardRepository = {
      listDashboards: vi.fn().mockResolvedValue([]),
      updateTasks: vi.fn(),
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
        { ...dashboard.tasks[1]!, due: '2026-10-07', assignees: [] },
      ],
    }
    const repo: DashboardRepository = {
      listDashboards: vi.fn().mockResolvedValue([detailed]),
      updateTasks: vi.fn(),
    }
    const { app } = setup(repo)

    const response = await app.request('http://localhost/events/hiroshima-3')
    const page = await response.text()

    expect(response.status).toBe(200)
    expect(page).toContain('GitHub Dashboard Issue')
    expect(page).toContain('2026-11-01')
    expect(page).toContain('name="done.venue" value="true" checked')
    expect(page).toContain('今日')
    expect(page).toContain('name="notify.venue"')
    expect(page).toContain('name="assign.venue" value="alice" checked')

    const savedPage = await (await app.request('http://localhost/events/hiroshima-3?saved=1')).text()
    expect(savedPage).toContain('変更を保存しました。')
  })

  it('returns useful empty and not-found pages', async () => {
    const { app } = setup()

    expect((await app.request('http://localhost/events/missing')).status).toBe(404)

    const emptyRepo: DashboardRepository = {
      listDashboards: vi.fn().mockResolvedValue([]),
      updateTasks: vi.fn(),
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
    expect(repo.updateTasks).toHaveBeenCalledWith(42, [{ taskId: 'venue', done: true }], dashboard.updatedAt)
  })

  it('saves just the requested row and returns the revision to use for the remaining draft', async () => {
    const updated = { ...dashboard, updatedAt: '2026-10-07T02:00:00Z', tasks: dashboard.tasks.map(task =>
      task.id === 'venue' ? { ...task, done: true, assignees: ['alice'] } : task) }
    const repo = { listDashboards: vi.fn().mockResolvedValueOnce([dashboard]).mockResolvedValue([updated]),
      updateTasks: vi.fn().mockResolvedValue(updated) }
    const { app } = setup(repo)
    const headers = { Origin: 'http://localhost', 'X-Ichiza-Editor': 'event' }
    const first = await app.request('http://localhost/events/hiroshima-3/tasks/venue', {
      method: 'POST', headers, body: new URLSearchParams({ issueNumber: '42', expectedUpdatedAt: dashboard.updatedAt!,
        'done.venue': 'true', 'assign.venue': 'alice', 'notify.announce': 'date' }),
    })
    expect(first.status).toBe(200)
    expect(repo.updateTasks).toHaveBeenCalledExactlyOnceWith(42, [{taskId: 'venue', done: true, assignees: ['alice']}], dashboard.updatedAt)
    const version = (await first.text()).match(/name="expectedUpdatedAt" value="([^"]+)"/)?.[1]
    expect(version).toBe(updated.updatedAt)
    const second = await app.request('http://localhost/events/hiroshima-3/tasks', {
      method: 'POST', headers, body: new URLSearchParams({ issueNumber: '42', expectedUpdatedAt: version!,
        'notify.announce': 'date', 'date.announce': '2026-10-09' }),
    })
    expect(second.status).toBe(200)
    expect(repo.updateTasks).toHaveBeenLastCalledWith(42, [{taskId: 'announce', reminder: '2026-10-09'}], version)
  })

  it('assigns a task to a configured member', async () => {
    const { app, repo } = setup()
    const form = new URLSearchParams({ assignee: 'bob', issueNumber: '42', expectedUpdatedAt: dashboard.updatedAt ?? '' })

    const response = await app.request('http://localhost/events/hiroshima-3/tasks/venue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: 'http://localhost' },
      body: form,
    })

    expect(response.status).toBe(303)
    expect(repo.updateTasks).toHaveBeenCalledWith(42, [{ taskId: 'venue', assignees: ['bob'] }], dashboard.updatedAt)
  })

  it('saves multiple owners, completion and reminders in one update, skipping unchanged rows', async () => {
    const { app, repo } = setup()
    const body = new URLSearchParams({
      issueNumber: '42', expectedUpdatedAt: dashboard.updatedAt!, 'assign.announce': '',
      'mention.announce': 'true', 'done.announce': 'true', 'notify.announce': 'date', 'date.announce': '2026-11-16',
      'assign.venue': 'alice', 'notify.venue': 'default',
    })
    body.append('assign.announce', 'alice')
    body.append('assign.announce', 'bob')
    body.append('assign.venue', 'bob')
    const response = await app.request('http://localhost/events/hiroshima-3/tasks', {
      method: 'POST', headers: { Origin: 'http://localhost' }, body,
    })
    expect(response.status).toBe(303)
    expect(repo.updateTasks).toHaveBeenCalledExactlyOnceWith(42, [{
      taskId: 'announce', assignees: ['alice', 'bob'], done: true, reminder: '2026-11-16', mentionAssignees: true,
    }], dashboard.updatedAt)
  })

  it.each([
    ['assign.announce', 'unknown-member', dashboard.updatedAt!, 400],
    ['assign.missing', 'alice', dashboard.updatedAt!, 404],
    ['notify.announce', 'date', dashboard.updatedAt!, 400],
    ['assign.announce', 'alice', 'stale-version', 409],
  ] as const)('rejects the whole batch for %s=%s at %s', async (key, value, version, status) => {
    const { app, repo } = setup()
    const response = await app.request('http://localhost/events/hiroshima-3/tasks', {
      method: 'POST', headers: { Origin: 'http://localhost' },
      body: new URLSearchParams({ issueNumber: '42', expectedUpdatedAt: version, 'assign.venue': 'bob', [key]: value }),
    })
    expect(response.status).toBe(status)
    expect(repo.updateTasks).not.toHaveBeenCalled()
  })

  it('allows unassigning a task', async () => {
    const { app, repo } = setup()
    const form = new URLSearchParams({ assignee: '', issueNumber: '42', expectedUpdatedAt: dashboard.updatedAt ?? '' })

    const response = await app.request('http://localhost/events/hiroshima-3/tasks/venue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: 'http://localhost' },
      body: form,
    })

    expect(response.status).toBe(303)
    expect(repo.updateTasks).toHaveBeenCalledWith(42, [{ taskId: 'venue', assignees: [] }], dashboard.updatedAt)
  })

  it('rejects assigning a task to an unconfigured member', async () => {
    const { app, repo } = setup()
    const response = await app.request('http://localhost/events/hiroshima-3/tasks/venue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: 'http://localhost' },
      body: new URLSearchParams({ assignee: 'mallory', issueNumber: '42', expectedUpdatedAt: dashboard.updatedAt ?? '' }),
    })

    expect(response.status).toBe(400)
    expect(repo.updateTasks).not.toHaveBeenCalled()
  })

  it('returns a guided conflict page instead of overwriting GitHub changes', async () => {
    const repo: DashboardRepository = {
      listDashboards: vi.fn().mockResolvedValue([dashboard]),
      updateTasks: vi.fn().mockRejectedValue(new DashboardConflictError()),
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
    expect(repo.updateTasks).not.toHaveBeenCalled()
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
      body: new URLSearchParams({ done: 'true', issueNumber: '42', expectedUpdatedAt: dashboard.updatedAt ?? '' }),
    })
    expect(mismatch.status).toBe(404)
    expect(repo.updateTasks).not.toHaveBeenCalled()
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
      updateTasks: vi.fn(),
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
