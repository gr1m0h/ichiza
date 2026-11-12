import { describe, expect, it } from 'vitest'

import { parseDashboard, updateDashboardTasks } from './dashboard'

const dashboardBody = `<!-- ichiza-dashboard:v1 slug=hiroshima-3 date=2026-11-01 -->

# SRE Lounge Hiroshima #3

<!-- ichiza-tasks:start -->
- [x] **2026-10-20** 会場を確定する · @alice <!-- ichiza-task:{"id":"venue","due":"2026-10-20","assignee":"alice","labels":["venue"]} -->
  確認事項:
  - [ ] Wi-Fi
- [ ] **2026-10-25** 参加者へ告知する <!-- ichiza-task:{"id":"announce","due":"2026-10-25","labels":["announce"]} -->
<!-- ichiza-tasks:end -->

## Notes
- [ ] 運営メモ
`

describe('parseDashboard', () => {
  it('reads only managed top-level task checkboxes', () => {
    const dashboard = parseDashboard(dashboardBody, 42, 'https://github.example/issues/42')

    expect(dashboard.slug).toBe('hiroshima-3')
    expect(dashboard.title).toBe('SRE Lounge Hiroshima #3')
    expect(dashboard.date).toBe('2026-11-01')
    expect(dashboard.tasks).toEqual([
      {
        id: 'venue',
        title: '会場を確定する',
        due: '2026-10-20',
        assignees: ['alice'],
        labels: ['venue'],
        done: true,
      },
      {
        id: 'announce',
        title: '参加者へ告知する',
        due: '2026-10-25',
        assignees: [],
        labels: ['announce'],
        done: false,
      },
    ])
  })

  it('rejects content outside the dashboard contract', () => {
    expect(() => parseDashboard('# ordinary issue', 1, 'https://github.example/issues/1')).toThrow(
      'missing dashboard marker',
    )
  })

  it('rejects missing task markers', () => {
    const malformed = dashboardBody.replace('<!-- ichiza-tasks:end -->', '')

    expect(() => parseDashboard(malformed, 1, 'https://github.example/issues/1')).toThrow(
      'missing dashboard task markers',
    )
  })

  it('rejects a managed checkbox whose metadata was removed', () => {
    const malformed = dashboardBody.replace(
      ' <!-- ichiza-task:{"id":"announce","due":"2026-10-25","labels":["announce"]} -->',
      '',
    )

    expect(() => parseDashboard(malformed, 1, 'https://github.example/issues/1')).toThrow(
      'invalid managed task line',
    )
  })

  it.each([
    ['leading space', ' - [ ]'],
    ['star bullet', '* [ ]'],
    ['double space', '-  [ ]'],
  ])('rejects a managed checkbox with %s', (_name, prefix) => {
    const malformed = dashboardBody.replace('- [ ] **2026-10-25**', `${prefix} **2026-10-25**`)

    expect(() => parseDashboard(malformed, 1, 'https://github.example/issues/1')).toThrow(
      'invalid managed task line',
    )
  })

  it('rejects invalid or contradictory task metadata', () => {
    const invalid = dashboardBody.replace('"labels":["venue"]', '"labels":[1]')
    const contradictory = dashboardBody.replace('"due":"2026-10-20"', '"due":"2026-10-21"')

    expect(() => parseDashboard(invalid, 1, 'https://github.example/issues/1')).toThrow(
      'invalid task metadata',
    )
    expect(() => parseDashboard(contradictory, 1, 'https://github.example/issues/1')).toThrow(
      'visible metadata does not match marker',
    )
  })

  it('rejects duplicate managed task ids', () => {
    const duplicate = dashboardBody.replace('"id":"announce"', '"id":"venue"')

    expect(() => parseDashboard(duplicate, 1, 'https://github.example/issues/1')).toThrow(
      'duplicate task id',
    )
  })
})

describe('completion updates', () => {
  it('updates one managed checkbox and preserves all other text', () => {
    const updated = updateDashboardTasks(dashboardBody, [{ taskId: 'announce', done: true }])

    expect(updated).toContain(
      '- [x] **2026-10-25** 参加者へ告知する <!-- ichiza-task:{"id":"announce"',
    )
    expect(updated).toContain('  - [ ] Wi-Fi')
    expect(updated).toContain('- [ ] 運営メモ')
  })

  it('rejects an unknown task id', () => {
    expect(() => updateDashboardTasks(dashboardBody, [{ taskId: 'missing', done: true }])).toThrow('task "missing" not found')
  })

  it('rejects duplicate target ids', () => {
    const duplicate = dashboardBody.replace('"id":"announce"', '"id":"venue"')

    expect(() => updateDashboardTasks(duplicate, [{ taskId: 'venue', done: true }])).toThrow('duplicate task id "venue"')
  })
})

describe('assignment updates', () => {
  it('assigns one managed task and keeps metadata in sync', () => {
    const updated = updateDashboardTasks(dashboardBody, [{ taskId: 'announce', assignees: ['bob'] }])

    expect(updated).toContain('- [ ] **2026-10-25** 参加者へ告知する · @bob')
    expect(updated).toContain('"assignee":"bob"')
    expect(updated).toContain('"assignee_source":"runtime"')
    expect(updated).toContain('· @alice')
  })

  it('unassigns one managed task', () => {
    const updated = updateDashboardTasks(dashboardBody, [{ taskId: 'venue', assignees: [] }])

    expect(updated).toContain('- [x] **2026-10-20** 会場を確定する <!-- ichiza-task:')
    expect(updated).toContain('"id":"venue"')
    expect(updated).toContain('"assignee_source":"runtime"')
  })

  it('rejects an invalid GitHub login', () => {
    expect(() => updateDashboardTasks(dashboardBody, [{ taskId: 'announce', assignees: ['not valid'] }])).toThrow(
      'invalid assignee',
    )
  })

  it('rejects an unknown task id', () => {
    expect(() => updateDashboardTasks(dashboardBody, [{ taskId: 'missing', assignees: ['alice'] }])).toThrow(
      'task "missing" not found',
    )
  })

  it('rejects duplicate target ids', () => {
    const duplicate = dashboardBody.replace('"id":"announce"', '"id":"venue"')

    expect(() => updateDashboardTasks(duplicate, [{ taskId: 'venue', assignees: ['alice'] }])).toThrow(
      'duplicate task id "venue"',
    )
  })
})
