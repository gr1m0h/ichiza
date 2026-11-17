import { describe, expect, it, vi } from 'vitest'

import { parseDashboard, updateDashboardTasks, type EventDashboard } from './dashboard'
import { DashboardConflictError, GitHubRequestError, GitHubTransportError } from './github'
import { createApp, dateInTimeZone, type DashboardRepository } from './app'
import { AccessError } from './auth'
import { logoSvg } from './brand'
import { createSnapshot, createAggregate, parseAggregate, renderAggregate, renderRecord, RecordConflictError, type RecordRepository } from './records'

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

function setup(repository?: DashboardRepository, records?: RecordRepository) {
  const repo =
    repository ??
    ({
      listDashboards: vi.fn().mockResolvedValue([dashboard]),
      updateTasks: vi.fn().mockResolvedValue(dashboard),
    } satisfies DashboardRepository)
  const app = createApp({
    authenticate: vi.fn().mockResolvedValue({ email: 'alice@example.com', github: 'alice' }),
    repository: () => repo,
    ...(records ? {records: () => records} : {}),
    members: () => [
      { email: 'alice@example.com', github: 'alice' },
      { email: 'bob@example.com', github: 'bob' },
    ],
    now: () => new Date('2026-10-07T00:00:00Z'),
  })
  return { app, repo }
}

describe('ichiza web', () => {
  it('serves only the shared brand asset publicly while protecting event data', async () => {
    const authenticate = vi.fn().mockRejectedValue(new AccessError(403, 'denied'))
    const app = createApp({ authenticate })
    const icon = await app.request('http://localhost/img/logo.svg')
    expect(icon.status).toBe(200)
    expect(icon.headers.get('Content-Type')).toContain('image/svg+xml')
    expect(await icon.text()).toBe(logoSvg)
    expect(authenticate).not.toHaveBeenCalled()
    expect((await app.request('http://localhost/')).status).toBe(403)
  })

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

    const response = await app.request('http://localhost/events/hiroshima-3?tab=edit')
    const page = await response.text()

    expect(response.status).toBe(200)
    expect(page).toContain('Event Hub Issue')
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


const managedBody = `<!-- ichiza-dashboard:v1 slug=hiroshima-3 date=2026-11-01 -->
# Event
<!-- ichiza-tasks:start -->
- [ ] **2026-10-06** 会場を確定する · @alice <!-- ichiza-task:{"id":"venue","due":"2026-10-06","assignee":"alice"} -->
  - [ ] Wi-Fi確認
<!-- ichiza-tasks:end -->
## Notes
メモは残す
`

describe('event dashboard and task lifecycle', () => {
  it('opens the overview by default and identifies overdue work without showing settings', async () => {
    const {app} = setup()
    const page = await (await app.request('http://localhost/events/hiroshima-3')).text()
    const overdue = page.split('data-task-status="overdue"')[1]?.split('</li>')[0]
    expect(page).toContain('data-initial-filter="all"')
    expect(overdue).toContain('会場を確定する')
    expect(overdue).toContain('2026-10-06')
    expect(overdue).toContain('@alice')
    expect(overdue).toContain('1日超過')
    expect(overdue).not.toContain('参加者へ告知する')
    expect(page).not.toContain('<form')
    expect(page).toContain('?tab=edit#task-venue')
    const edit = await (await app.request('http://localhost/events/hiroshima-3?tab=edit')).text()
    expect(edit).toContain('data-add-task')
    expect(edit).toContain('name="delete.venue"')
  })

  it('records completion, reopen, and recompletion without inventing legacy dates or duplicating unchanged saves', () => {
    const completed = updateDashboardTasks(managedBody, [{taskId: 'venue', done: true}], new Date('2026-10-07T01:00:00Z'))
    const task = parseDashboard(completed, 42, '').tasks[0]!
    expect(task.completed_at).toBe('2026-10-07T01:00:00.000Z')
    expect(task.history).toEqual([{at: task.completed_at, done: true}])
    expect(updateDashboardTasks(completed, [{taskId: 'venue', done: true}])).toBe(completed)
    const reopened = updateDashboardTasks(completed, [{taskId: 'venue', done: false}], new Date('2026-10-08T01:00:00Z'))
    expect(parseDashboard(reopened, 42, '').tasks[0]?.completed_at).toBeUndefined()
    const again = parseDashboard(updateDashboardTasks(reopened, [{taskId: 'venue', done: true}], new Date('2026-10-09T01:00:00Z')), 42, '').tasks[0]!
    expect(again.history?.map(entry => entry.done)).toEqual([true, false, true])
    expect(again.completed_at).toBe('2026-10-09T01:00:00.000Z')
    const legacy = parseDashboard(updateDashboardTasks(managedBody.replace('- [ ] **', '- [x] **'), [{taskId: 'venue', reminder: 'off'}]), 42, '').tasks[0]!
    expect(legacy.completed_at).toBeUndefined()
    expect(legacy.history).toBeUndefined()
  })

  it('shows known completion times in the event timezone, late completion and unknown legacy dates', async () => {
    const data = {...dashboard, tasks: [
      {...dashboard.tasks[0]!, done: true, completed_at: '2026-10-06T15:30:00Z', history: [{at: '2026-10-06T15:30:00Z', done: true}, {at: '2026-10-06T14:00:00Z', done: false}]},
      {...dashboard.tasks[1]!, done: true},
    ]}
    const {app} = setup({listDashboards: vi.fn().mockResolvedValue([data]), updateTasks: vi.fn()})
    const page = await (await app.request('http://localhost/events/hiroshima-3')).text()
    expect(page).toContain('2026/10/07 00:30')
    expect(page).toContain('期日内 0件、期日後 1件、日時未記録 1件')
    expect(page).toContain('再開')
    expect(page).toContain('日時未記録')
    expect(page).toContain('data-initial-filter="all"')
  })

  it('adds configured tasks, deletes managed text and retains notes and CRLF', () => {
    const created = updateDashboardTasks(managedBody.replaceAll('\n', '\r\n'), [{taskId: 'web-added', create: {title: ' 配信テスト ', due: '2026-10-10'}, assignees: ['alice', 'bob'], reminder: '2026-10-09', mentionAssignees: true, done: true}])
    const added = parseDashboard(created, 42, '').tasks.find(task => task.id === 'web-added')!
    expect(added).toMatchObject({title: '配信テスト', done: true, task_source: 'runtime', assignees: ['alice', 'bob'], reminder: '2026-10-09', mention_assignees: true})
    expect(added.created_at).toBeTruthy()
    const removed = updateDashboardTasks(created, [{taskId: 'venue', delete: true}])
    expect(parseDashboard(removed, 42, '').tasks.map(task => task.id)).toEqual(['web-added'])
    expect(removed).not.toContain('Wi-Fi確認')
    expect(removed).toContain('<!-- ichiza-deleted-task:venue -->\r\n')
    expect(removed).toContain('## Notes\r\nメモは残す')
    expect(() => updateDashboardTasks(removed, [{taskId: 'venue', create: {title: '復活', due: '2026-10-10'}}])).toThrow('deleted task id')
  })

  it.each(['', 'bad\ntitle', '<!-- injected -->', 'title · @alice'])('rejects an invalid task title %s', title => {
    expect(() => updateDashboardTasks(managedBody, [{taskId: 'web-added', create: {title, due: '2026-10-10'}}])).toThrow('invalid new task')
  })

  it('saves creation and deletion together with member and reminder validation', async () => {
    const {app, repo} = setup()
    const response = await app.request('http://localhost/events/hiroshima-3/tasks', {
      method: 'POST', headers: {Origin: 'http://localhost'}, body: new URLSearchParams({
        issueNumber: '42', expectedUpdatedAt: dashboard.updatedAt!, 'delete.venue': 'true',
        'create.web-added': 'true', 'title.web-added': '配信テスト', 'due.web-added': '2026-10-10',
        'assign.web-added': 'alice', 'notify.web-added': 'off', 'mention.web-added': 'true',
      }),
    })
    expect(response.status).toBe(303)
    expect(response.headers.get('Location')).toBe('/events/hiroshima-3?tab=edit&saved=1')
    expect(repo.updateTasks).toHaveBeenCalledWith(42, [{taskId: 'venue', delete: true}, {taskId: 'web-added', create: {title: '配信テスト', due: '2026-10-10'}, assignees: ['alice'], reminder: 'off', mentionAssignees: true}], dashboard.updatedAt)
  })

  it.each([
    {'create.web-added': 'true', 'title.web-added': 'テスト', 'due.web-added': '2026-02-30'},
    {'create.web-added': 'true', 'title.web-added': 'テスト', 'due.web-added': '2026-10-10', 'assign.web-added': 'unknown'},
    {'delete.venue': 'false'},
    {'create.venue': 'true', 'title.venue': '置換', 'due.venue': '2026-10-10'},
  ])('rejects invalid structural updates atomically: %j', async fields => {
    const {app, repo} = setup()
    const response = await app.request('http://localhost/events/hiroshima-3/tasks', {
      method: 'POST', headers: {Origin: 'http://localhost'}, body: new URLSearchParams([
        ['issueNumber', '42'], ['expectedUpdatedAt', dashboard.updatedAt!],
        ...Object.entries(fields).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
      ]),
    })
    expect(response.status).toBe(400)
    expect(repo.updateTasks).not.toHaveBeenCalled()
  })

  it('allows adding the first task to an empty event and returning an empty editor after deleting the last', async () => {
    const empty = {...dashboard, tasks: []}
    const repo = {listDashboards: vi.fn().mockResolvedValue([empty]), updateTasks: vi.fn()}
    const {app} = setup(repo)
    const page = await (await app.request('http://localhost/events/hiroshima-3?tab=edit')).text()
    expect(page).toContain('data-add-task')
    expect(page).toContain('name="expectedUpdatedAt"')
  })
})


describe('compact dashboard metrics', () => {
  it('counts completion events by local day, deduplicates the current timestamp and includes unknown dates separately', async () => {
    const data: EventDashboard = {...dashboard, tasks: [
      {...dashboard.tasks[0]!, done:true, completed_at:'2026-10-06T15:30:00Z', history:[
        {at:'2026-10-05T15:00:00Z', done:true}, {at:'2026-10-06T00:00:00Z', done:false}, {at:'2026-10-06T15:30:00Z', done:true},
      ]},
      {...dashboard.tasks[1]!, done:true},
    ]}
    const {app} = setup({listDashboards:vi.fn().mockResolvedValue([data]),updateTasks:vi.fn()})
    const page = await (await app.request('http://localhost/events/hiroshima-3')).text()
    expect(page).toContain('10/6 1件、10/7 1件')
    expect(page).toContain('期日内 0件、期日後 1件、日時未記録 1件')
    expect(page).toContain('<details class="info-popover">')
    expect(page).not.toContain('<p class="history-note">')
    expect(page).toContain('aria-label="会場を確定するを編集"')
  })

  it('keeps legacy completion timestamps in the chart when no activity history is available', async () => {
    const data: EventDashboard = {...dashboard,tasks:[{...dashboard.tasks[0]!,done:true,completed_at:'2026-10-06T03:00:00Z'}]}
    const {app} = setup({listDashboards:vi.fn().mockResolvedValue([data]),updateTasks:vi.fn()})
    const page = await (await app.request('http://localhost/events/hiroshima-3')).text()
    expect(page).toContain('10/6 1件、10/7 0件')
    expect(page).toContain('期日内 1件、期日後 0件、日時未記録 0件')
  })

  it('shows zero completed work without manufacturing timestamps and leaves all rows available without JavaScript', async () => {
    const {app} = setup()
    const page = await (await app.request('http://localhost/events/hiroshima-3')).text()
    expect(page).toContain('data-initial-filter="all"')
    expect(page).toContain('data-task-status="overdue"')
    expect(page).toContain('data-task-status="upcoming"')
    expect(page).not.toContain('data-task-status="overdue" hidden')
    expect(page).toContain('class="no-completions"')
    expect(page).toContain('10/7 0件')
  })
})


describe('automatically synchronized metrics index',()=>{
  const closed={...dashboard,state:'closed' as const,date:'2026-10-01',closedAt:'2026-10-07T00:00:00Z'}
  const snapshot=createAggregate([closed],'Asia/Tokyo','2026-10-07T00:00:00.000Z')
  const record=parseAggregate(renderAggregate(snapshot),99,'https://github.example/issues/99','2026-10-07T02:00:00Z')
  const source=()=>({listDashboards:vi.fn().mockRejectedValue(new Error('must not list all Issues')),getDashboard:vi.fn().mockResolvedValue(closed),updateTasks:vi.fn()})
  const records=()=>({loadAggregate:vi.fn().mockResolvedValue(record),saveAggregate:vi.fn()})

  it('renders the metrics dashboard and year filters with one index read and no event enumeration',async()=>{
    const events=source(),index=records(),{app}=setup(events,index)
    const page=await(await app.request('http://localhost/records')).text()
    expect(page).toContain('SRE Lounge Hiroshima #3')
    expect(page).toContain('自動同期')
    expect(page).not.toContain('/records/save?')
    expect(index.loadAggregate).toHaveBeenCalledTimes(1)
    expect(events.listDashboards).not.toHaveBeenCalled()
    expect(await(await app.request('http://localhost/records?year=2025')).text()).toContain('Closeされたイベントがここに表示されます')
    expect((await app.request('http://localhost/records?year=bad')).status).toBe(400)
  })
  it('exports Markdown and CSV only from the index, without any event listing or writes',async()=>{
    const events=source(),index=records(),{app}=setup(events,index)
    const csv=await app.request('http://localhost/records/export?format=csv')
    expect(await csv.text()).toContain('"SRE Lounge Hiroshima #3"')
    const md=await app.request('http://localhost/records/export?format=markdown')
    expect(await md.text()).toBe(renderAggregate(snapshot))
    expect(events.listDashboards).not.toHaveBeenCalled()
    expect(index.saveAggregate).not.toHaveBeenCalled()
    expect(index.loadAggregate).toHaveBeenCalledTimes(2)
  })
  it('shows initialization pending instead of falling back to listing all Issues',async()=>{
    const events=source(),index={...records(),loadAggregate:vi.fn().mockResolvedValue(undefined)},{app}=setup(events,index)
    expect(await(await app.request('http://localhost/records')).text()).toContain('初回の自動同期を待っています')
    expect((await app.request('http://localhost/records/export?format=csv')).status).toBe(404)
    expect(events.listDashboards).not.toHaveBeenCalled()
    expect(index.saveAggregate).not.toHaveBeenCalled()
  })
  it('retrieves just the individual Closed Issue referenced by the index',async()=>{
    const events=source(),index=records(),{app}=setup(events,index)
    const page=await(await app.request('http://localhost/records/hiroshima-3')).text()
    expect(page).toContain('Event Hub Issue ↗')
    expect(events.getDashboard).toHaveBeenCalledExactlyOnceWith(42)
    expect(events.listDashboards).not.toHaveBeenCalled()
    expect((await app.request('http://localhost/records/missing')).status).toBe(404)
    expect(events.getDashboard).toHaveBeenCalledTimes(1)
    const md=await app.request('http://localhost/records/hiroshima-3/export?format=markdown')
    expect(await md.text()).toBe(renderRecord(createSnapshot(closed,'Asia/Tokyo',closed.closedAt)))
    expect(events.listDashboards).not.toHaveBeenCalled()
  })
  it('rejects removed or reopened archive sources without listing Issues',async()=>{
    const events=source(),{app}=setup(events,records())
    events.getDashboard.mockResolvedValueOnce({...closed,state:'open'})
    expect((await app.request('http://localhost/records/hiroshima-3')).status).toBe(404)
    expect(events.listDashboards).not.toHaveBeenCalled()
  })
  it('disables the former manual save path, without reading or writing GitHub',async()=>{
    const events=source(),index=records(),{app}=setup(events,index)
    expect((await app.request('http://localhost/records/save')).status).toBe(303)
    expect((await app.request('http://localhost/records/save',{method:'POST'})).status).toBe(410)
    expect(index.loadAggregate).not.toHaveBeenCalled()
    expect(index.saveAggregate).not.toHaveBeenCalled()
    expect(events.listDashboards).not.toHaveBeenCalled()
  })
})


it('separates completion state from completion date and orders open tasks before completed tasks',async()=>{
  const base=dashboard.tasks[0]!
  const tasks=[
    {...base,id:'done-unknown',title:'日時がない完了タスク',done:true},
    {...base,id:'future-open',title:'今後の未完了タスク',done:false,due:'2026-10-20'},
    {...base,id:'done-known',title:'日時がある完了タスク',done:true,completed_at:'2026-10-05T01:00:00Z'},
    {...base,id:'overdue-open',title:'期限超過の未完了タスク',done:false,due:'2026-10-01'},
  ]
  const {app}=setup({listDashboards:vi.fn().mockResolvedValue([{...dashboard,tasks}]),updateTasks:vi.fn()})
  const page=await(await app.request('http://localhost/events/hiroshima-3/results')).text()
  expect(page).toContain('<th>状態</th>')
  expect(page).toContain('<th>完了日</th>')
  const table=page.split('<table class="metrics-comparison individual-tasks">')[1]!.split('</table>')[0]!
  const rows=[...table.matchAll(/<tr><td>(.*?)<\/tr>/g)].map(match=>match[1]!)
  expect(rows).toHaveLength(4)
  expect(rows[0]).toContain('期限超過の未完了タスク')
  expect(rows[1]).toContain('今後の未完了タスク')
  expect(rows[0]).toContain('>未完了</span></td><td>2026-10-01</td><td>—</td>')
  expect(rows[2]).toContain('日時がある完了タスク')
  expect(rows[2]).toContain('>完了</span></td><td>2026-10-06</td><td>2026-10-05</td>')
  expect(rows[3]).toContain('日時がない完了タスク')
  expect(rows[3]).toContain('>完了</span>')
  expect(rows[3]).toContain('>未記録</span>')
  expect(table).not.toContain('record-task-mark')
})
