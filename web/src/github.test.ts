import { describe, expect, it, vi } from 'vitest'

import { DashboardConflictError, GitHubClient } from './github'

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
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer secret' }) }),
    )
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

    await client.updateTask(42, 'announce', true, issue.updated_at)

    const patch = fetchMock.mock.calls[1]
    expect(patch?.[1]?.method).toBe('PATCH')
    expect(JSON.parse(String(patch?.[1]?.body))).toEqual({ body: expect.stringContaining('- [x]') })
  })

  it('rejects a stale update before patching GitHub', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json(issue))
    const client = new GitHubClient({ repository: 'gr1m0h/community', token: 'secret', fetch: fetchMock })

    await expect(client.updateTask(42, 'announce', true, '2026-10-07T00:00:00Z')).rejects.toBeInstanceOf(
      DashboardConflictError,
    )
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('does not leak response bodies when GitHub returns an error', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response('token=secret', { status: 403 }))
    const client = new GitHubClient({ repository: 'gr1m0h/community', token: 'secret', fetch: fetchMock })

    await expect(client.listDashboards()).rejects.toThrow('GitHub API request failed (403)')
  })

  it('rejects invalid runtime configuration', () => {
    expect(() => new GitHubClient({ repository: '../other', token: 'secret' })).toThrow(
      'ICHIZA_REPOSITORY must be owner/repository',
    )
    expect(() => new GitHubClient({ repository: 'gr1m0h/community', token: '' })).toThrow(
      'ICHIZA_GITHUB_TOKEN is required',
    )
  })
})
