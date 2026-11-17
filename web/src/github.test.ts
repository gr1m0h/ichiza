import { describe, expect, it, vi } from 'vitest'

import { DashboardConflictError, GitHubClient } from './github'
import { parseDashboard } from './dashboard'
import { createAggregate, renderAggregate, validateAggregate, RecordConflictError } from './records'

const body = `<!-- ichiza-dashboard:v1 slug=hiroshima-3 date=2026-11-01 -->

# SRE Lounge Hiroshima #3

<!-- ichiza-tasks:start -->
- [ ] **2026-10-25** 参加者へ告知する <!-- ichiza-task:{"id":"announce","due":"2026-10-25","labels":["announce"]} -->
<!-- ichiza-tasks:end -->

## Notes
`

const issue = {
  number: 42,
  html_url: 'https://github.example/issues/42',
  updated_at: '2026-10-07T01:00:00Z',
  body,
}

describe('GitHubClient', () => {
  it('lists and parses labelled event dashboards', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json([issue]))
    const client = new GitHubClient({ repository: 'gr1m0h/community', token: 'secret', fetch: fetchMock })

    const dashboards = await client.listDashboards()

    expect(dashboards[0]?.slug).toBe('hiroshima-3')
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.github.com/repos/gr1m0h/community/issues?state=all&labels=ichiza%3Aevent&per_page=100',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer secret',
          'User-Agent': 'ichiza-web',
        }),
      }),
    )
  })

  it('calls fetch without binding GitHubClient as its receiver', async () => {
    let receiver: unknown = null
    const fetchMock = vi.fn(async function (this: unknown) {
      receiver = this
      return Response.json([])
    }) as typeof fetch
    const client = new GitHubClient({ repository: 'gr1m0h/community', token: 'secret', fetch: fetchMock })

    await client.listDashboards()

    expect(receiver).toBeUndefined()
  })

  it('ignores pull requests returned by the issues endpoint', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json([{ ...issue, pull_request: { url: 'https://github.example/pulls/1' } }]))
    const client = new GitHubClient({ repository: 'gr1m0h/community', token: 'secret', fetch: fetchMock })

    await expect(client.listDashboards()).resolves.toEqual([])
  })

  it('loads every page when a repository has more than 100 dashboards', async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) => ({
      ...issue,
      number: index + 1,
      body: body.replaceAll('hiroshima-3', `event-${index + 1}`),
    }))
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(firstPage))
      .mockResolvedValueOnce(
        Response.json([{ ...issue, number: 101, body: body.replaceAll('hiroshima-3', 'event-101') }]),
      )
    const client = new GitHubClient({ repository: 'gr1m0h/community', token: 'secret', fetch: fetchMock })

    const dashboards = await client.listDashboards()

    expect(dashboards).toHaveLength(101)
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      'https://api.github.com/repos/gr1m0h/community/issues?state=all&labels=ichiza%3Aevent&per_page=100&page=2',
    )
  })

  it('updates only the requested checkbox using the latest issue body', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(issue))
      .mockResolvedValueOnce(Response.json({ ...issue, body: body.replace('- [ ]', '- [x]') }))
    const client = new GitHubClient({ repository: 'gr1m0h/community', token: 'secret', fetch: fetchMock })

    await client.updateTasks(42, [{ taskId: 'announce', done: true }], issue.updated_at)

    const patch = fetchMock.mock.calls[1]
    expect(patch?.[1]?.method).toBe('PATCH')
    expect(JSON.parse(String(patch?.[1]?.body))).toEqual({ body: expect.stringContaining('- [x]') })
  })

  it('updates a task assignee using the latest issue body', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(issue))
      .mockResolvedValueOnce(Response.json({ ...issue, body: body.replace('<!-- ichiza-task:{"id":"announce","due":"2026-10-25","labels":["announce"]} -->', '<!-- ichiza-task:{"id":"announce","due":"2026-10-25","assignee":"alice","labels":["announce"]} -->').replace('参加者へ告知する <!--', '参加者へ告知する · @alice <!--') }))
    const client = new GitHubClient({ repository: 'gr1m0h/community', token: 'secret', fetch: fetchMock })

    await client.updateTasks(42, [{ taskId: 'announce', assignees: ['alice'] }], issue.updated_at)

    const patch = fetchMock.mock.calls[1]
    expect(JSON.parse(String(patch?.[1]?.body))).toEqual({
      body: expect.stringContaining('参加者へ告知する · @alice'),
    })
  })

  it('patches multiple assignees once, preserving other tasks, checkboxes and notes', async () => {
    const venue = '- [x] **2026-10-21** 会場 · @alice <!-- ichiza-task:{"id":"venue","due":"2026-10-21","assignee":"alice","labels":[]} -->'
    const untouched = venue.replaceAll('venue', 'other')
    const notes = `## Notes\n${venue}\n`
    const original = body.replace('<!-- ichiza-tasks:end -->', `${venue}\n${untouched}\n<!-- ichiza-tasks:end -->`).replace('## Notes\n', notes)
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ ...issue, body: original }))
      .mockImplementationOnce(async (_url, init) => Response.json({ ...issue, ...JSON.parse(String(init?.body)) }))
    const client = new GitHubClient({ repository: 'gr1m0h/community', token: 'secret', fetch: fetchMock })

    const result = await client.updateTasks(42, [{ taskId: 'venue', assignees: [] }, { taskId: 'announce', assignees: ['alice', 'bob'], reminder: '2026-10-24', mentionAssignees: true }], issue.updated_at)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[1]?.[1]?.method).toBe('PATCH')
    expect(result.tasks.map(task => [task.id, task.assignees, task.done])).toEqual([
      ['announce', ['alice', 'bob'], false], ['venue', [], true], ['other', ['alice'], true],
    ])
    expect(result.tasks[0]?.mention_assignees).toBe(true)
    expect(result.tasks[0]?.reminder).toBe('2026-10-24')
    expect(result.body).toContain(' · @alice @bob <!--')
    expect(result.body).toContain(untouched)
    expect(result.body.endsWith(notes)).toBe(true)
  })

  it('rejects a stale update before patching GitHub', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json(issue))
    const client = new GitHubClient({ repository: 'gr1m0h/community', token: 'secret', fetch: fetchMock })

    await expect(client.updateTasks(42, [{ taskId: 'announce', done: true }], '2026-10-07T00:00:00Z')).rejects.toBeInstanceOf(
      DashboardConflictError,
    )
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('does not leak response bodies when GitHub returns an error', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response('token=secret', { status: 403 }))
    const client = new GitHubClient({ repository: 'gr1m0h/community', token: 'secret', fetch: fetchMock })

    await expect(client.listDashboards()).rejects.toThrow('GitHub API request failed (403)')
  })

  it('trims surrounding whitespace from the configured token', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json([]))
    const client = new GitHubClient({ repository: 'gr1m0h/community', token: '  secret\n', fetch: fetchMock })

    await client.listDashboards()

    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer secret' }) }),
    )
  })

  it('redacts the token when GitHub fetch fails before returning a response', async () => {
    const token = 'github_pat_topsecret'
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new TypeError(`Fetch failed while using ${token}\nretry later`))
    const client = new GitHubClient({ repository: 'gr1m0h/community', token, fetch: fetchMock })

    const request = client.listDashboards()

    await expect(request).rejects.toMatchObject({
      name: 'GitHubTransportError',
      detail: 'TypeError: Fetch failed while using [REDACTED] retry later',
    })
    await expect(request).rejects.not.toThrow(token)
  })

  it('rejects invalid runtime configuration', () => {
    expect(() => new GitHubClient({ repository: '../other', token: 'secret' })).toThrow(
      'ICHIZA_REPOSITORY must be owner/repository',
    )
    expect(() => new GitHubClient({ repository: 'gr1m0h/community', token: '' })).toThrow(
      'ICHIZA_GITHUB_TOKEN is required',
    )
    expect(() => new GitHubClient({ repository: 'gr1m0h/community', token: ' \n ' })).toThrow(
      'ICHIZA_GITHUB_TOKEN is required',
    )
  })
})


describe('GitHub cross-event metrics', () => {
  const closedIssue={...issue,state:'closed' as const,closed_at:'2026-11-13T00:00:00Z'}
  const closed={...parseDashboard(body,issue.number,issue.html_url,issue.updated_at),state:'closed' as const,closedAt:closedIssue.closed_at}
  const snapshot=createAggregate([closed],'Asia/Tokyo','2026-11-13T01:00:00Z')
  const metricsIssue={...issue,number:99,body:renderAggregate(snapshot)}
  const expected={issueNumber:99,updatedAt:metricsIssue.updated_at}
  const savedResponse=async(_url:unknown,init?:RequestInit)=>Response.json({...metricsIssue,...JSON.parse(String(init?.body))})
  const client=(mock:typeof fetch)=>new GitHubClient({repository:'gr1m0h/community',token:'secret',fetch:mock})

  it('keeps GitHub Issue state and Close time when reading individual event records', async()=>{
    const mock=vi.fn<typeof fetch>().mockResolvedValue(Response.json([closedIssue]))
    expect((await client(mock).listDashboards())[0]).toMatchObject({state:'closed',closedAt:closedIssue.closed_at})
  })
  it('finds the one metrics Issue and skips unrelated labelled Issues and pull requests across pages',async()=>{
    const mock=vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json(Array.from({length:100},()=>({...issue,body:'ordinary label use'}))))
      .mockResolvedValueOnce(Response.json([metricsIssue,{...metricsIssue,pull_request:{}}]))
    expect((await client(mock).loadAggregate())?.issueNumber).toBe(99)
    expect(mock.mock.calls[1]?.[0]).toContain('labels=ichiza%3Ametrics&per_page=100&page=2')
  })
  it('creates a dedicated aggregate Issue with a metrics label, without creating event record Issues',async()=>{
    const mock=vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json([closedIssue])).mockResolvedValueOnce(Response.json([]))
      .mockResolvedValueOnce(new Response('',{status:404})).mockResolvedValueOnce(Response.json({name:'ichiza:metrics'})).mockImplementationOnce(savedResponse)
    expect((await client(mock).saveAggregate(validateAggregate(JSON.parse(JSON.stringify(snapshot))),null)).issueNumber).toBe(99)
    expect(JSON.parse(String(mock.mock.calls[4]?.[1]?.body))).toEqual({title:'[ichiza] Insights',body:renderAggregate(snapshot),labels:['ichiza:metrics']})
    expect(mock.mock.calls[4]?.[1]?.method).toBe('POST')
  })
  it('updates the same aggregate Issue instead of creating one per event or save',async()=>{
    const mock=vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json([closedIssue])).mockResolvedValueOnce(Response.json([metricsIssue]))
      .mockResolvedValueOnce(Response.json(metricsIssue)).mockImplementationOnce(savedResponse)
    await client(mock).saveAggregate(snapshot,expected)
    expect(mock.mock.calls[3]?.[0]).toContain('/issues/99')
    expect(mock.mock.calls[3]?.[1]?.method).toBe('PATCH')
  })
  it('rejects changed, newly closed or reopened event populations and forged metrics before writing',async()=>{
    for(const sources of [[{...closedIssue,updated_at:'2026-11-13T02:00:00Z'}],[{...closedIssue,state:'open'}],
      [closedIssue,{...closedIssue,number:43,body:body.replaceAll('hiroshima-3','other-event')}]] ){
      const mock=vi.fn<typeof fetch>().mockResolvedValue(Response.json(sources))
      await expect(client(mock).saveAggregate(snapshot,null)).rejects.toBeInstanceOf(RecordConflictError)
      expect(mock).toHaveBeenCalledTimes(1)
    }
    const mock=vi.fn<typeof fetch>().mockResolvedValue(Response.json([closedIssue]))
    await expect(client(mock).saveAggregate({...snapshot,events:[]},null)).rejects.toBeInstanceOf(RecordConflictError)
  })
  it('rejects duplicate creation retries, manual edits and duplicate aggregate Issues',async()=>{
    for(const [records,revision] of [[[metricsIssue],null],[[{...metricsIssue,updated_at:'2026-11-13T02:00:00Z'}],expected],[[metricsIssue,metricsIssue],expected]] as const){
      const mock=vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json([closedIssue])).mockResolvedValueOnce(Response.json(records))
      await expect(client(mock).saveAggregate(snapshot,revision)).rejects.toBeInstanceOf(RecordConflictError)
      expect(mock).toHaveBeenCalledTimes(2)
    }
  })
  it('rechecks the selected metrics Issue body before an update',async()=>{
    const mock=vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json([closedIssue])).mockResolvedValueOnce(Response.json([metricsIssue]))
      .mockResolvedValueOnce(Response.json({...metricsIssue,body:metricsIssue.body+'manual edit'}))
    await expect(client(mock).saveAggregate(snapshot,expected)).rejects.toBeInstanceOf(RecordConflictError)
    expect(mock).toHaveBeenCalledTimes(3)
  })
  it('handles a label creation race and stops when label access fails',async()=>{
    const mock=vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json([closedIssue])).mockResolvedValueOnce(Response.json([]))
      .mockResolvedValueOnce(new Response('',{status:404})).mockResolvedValueOnce(new Response('',{status:422}))
      .mockResolvedValueOnce(Response.json({name:'ichiza:metrics'})).mockImplementationOnce(savedResponse)
    await expect(client(mock).saveAggregate(snapshot,null)).resolves.toMatchObject({issueNumber:99})
    const forbidden=vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json([closedIssue])).mockResolvedValueOnce(Response.json([]))
      .mockResolvedValueOnce(new Response('',{status:403}))
    await expect(client(forbidden).saveAggregate(snapshot,null)).rejects.toThrow('403')
    expect(forbidden).toHaveBeenCalledTimes(3)
  })
})


describe('automatic metrics synchronization',()=>{
  const closed={...issue,state:'closed',closed_at:'2026-11-13T00:00:00Z'}
  const source={...parseDashboard(body,issue.number,issue.html_url,issue.updated_at),state:'closed' as const,closedAt:closed.closed_at}
  const snapshot=createAggregate([source],'Asia/Tokyo','2026-11-13T01:00:00.000Z')
  const index={...issue,number:99,body:renderAggregate(snapshot)}
  const client=(mock:typeof fetch)=>new GitHubClient({repository:'gr1m0h/community',token:'secret',fetch:mock})
  it('initializes one empty aggregate before any event is Closed',async()=>{
    const mock=vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json([])).mockResolvedValueOnce(Response.json([]))
      .mockResolvedValueOnce(Response.json({name:'ichiza:metrics'})).mockImplementationOnce(async(_url,init)=>Response.json({...index,...JSON.parse(String(init?.body))}))
    const record=await client(mock).syncAggregate('Asia/Tokyo',new Date('2026-11-13T01:00:00Z'))
    expect(record.snapshot.events).toEqual([])
    expect(mock.mock.calls.filter(call=>call[1]?.method==='POST')).toHaveLength(1)
  })
  it('skips a write when the index data has not changed',async()=>{
    const mock=vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json([closed])).mockResolvedValueOnce(Response.json([index]))
    expect((await client(mock).syncAggregate('Asia/Tokyo',new Date('2026-11-14T00:00:00Z'))).issueNumber).toBe(99)
    expect(mock).toHaveBeenCalledTimes(2)
    expect(mock.mock.calls.some(call=>call[1]?.method==='PATCH')).toBe(false)
  })
  it('updates the same Issue after an event is reopened',async()=>{
    const mock=vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json([{...closed,state:'open'}])).mockResolvedValueOnce(Response.json([index]))
      .mockResolvedValueOnce(Response.json(index)).mockImplementationOnce(async(_url,init)=>Response.json({...index,...JSON.parse(String(init?.body))}))
    const updated=await client(mock).syncAggregate('Asia/Tokyo',new Date('2026-11-14T00:00:00Z'))
    expect(updated.issueNumber).toBe(99)
    expect(updated.snapshot.events).toEqual([])
    expect(mock.mock.calls[3]?.[1]?.method).toBe('PATCH')
  })
  it('loads a single source Issue without pagination or scanning',async()=>{
    const mock=vi.fn<typeof fetch>().mockResolvedValue(Response.json(closed))
    expect((await client(mock).getDashboard(42))?.state).toBe('closed')
    expect(mock).toHaveBeenCalledExactlyOnceWith('https://api.github.com/repos/gr1m0h/community/issues/42',expect.anything())
  })
})
