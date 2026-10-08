import { type EventDashboard, parseDashboard, setDashboardTaskAssignee, toggleDashboardTask } from './dashboard'

export interface DashboardTaskChanges {
  readonly done?: boolean
  readonly assignee?: string
}

interface GitHubIssue {
  readonly number: number
  readonly html_url: string
  readonly updated_at: string
  readonly body: string | null
  readonly pull_request?: unknown
}

interface GitHubClientOptions {
  readonly repository: string
  readonly token: string
  readonly fetch?: typeof fetch
}

export class DashboardConflictError extends Error {
  constructor() {
    super('dashboard was updated on GitHub; reload before retrying')
    this.name = 'DashboardConflictError'
  }
}

export class GitHubRequestError extends Error {
  readonly status: number

  constructor(status: number) {
    super(`GitHub API request failed (${status})`)
    this.name = 'GitHubRequestError'
    this.status = status
  }
}

export class GitHubTransportError extends Error {
  readonly detail: string

  constructor(cause: unknown, token: string) {
    super('GitHub API transport failed')
    this.name = 'GitHubTransportError'
    const causeName = cause instanceof Error ? cause.name : 'UnknownError'
    const causeMessage = cause instanceof Error ? cause.message : String(cause)
    const redactedMessage = causeMessage.split(token).join('[REDACTED]').replace(/\s+/g, ' ').trim()
    this.detail = `${causeName}: ${redactedMessage || 'unknown error'}`
  }
}

export class GitHubClient {
  readonly #repository: string
  readonly #token: string
  readonly #fetch: typeof fetch

  constructor(options: GitHubClientOptions) {
    const token = options.token.trim()
    const repositoryParts = options.repository.split('/')
    const validRepository =
      repositoryParts.length === 2 &&
      repositoryParts.every(
        (part) => part !== '.' && part !== '..' && /^[A-Za-z0-9_.-]+$/.test(part),
      )
    if (!validRepository) {
      throw new Error('ICHIZA_REPOSITORY must be owner/repository')
    }
    if (token === '') throw new Error('ICHIZA_GITHUB_TOKEN is required')
    this.#repository = options.repository
    this.#token = token
    this.#fetch = options.fetch ?? fetch
  }

  async listDashboards(): Promise<readonly EventDashboard[]> {
    const basePath = `/issues?state=all&labels=${encodeURIComponent('ichiza:event')}&per_page=100`
    let issues: readonly GitHubIssue[] = []
    let pageNumber = 1
    while (true) {
      const path = pageNumber === 1 ? basePath : `${basePath}&page=${pageNumber}`
      const page = await this.#request<readonly GitHubIssue[]>(path)
      issues = [...issues, ...page]
      if (page.length < 100) break
      pageNumber += 1
    }
    return issues
      .filter((issue) => issue.pull_request === undefined)
      .map((issue) => this.#parseIssue(issue))
  }

  async updateTask(
    issueNumber: number,
    taskId: string,
    changes: DashboardTaskChanges,
    expectedUpdatedAt: string,
  ): Promise<EventDashboard> {
    const issue = await this.#request<GitHubIssue>(`/issues/${issueNumber}`)
    if (issue.updated_at !== expectedUpdatedAt) throw new DashboardConflictError()
    let updatedBody = issue.body ?? ''
    if (changes.done !== undefined) updatedBody = toggleDashboardTask(updatedBody, taskId, changes.done)
    if (changes.assignee !== undefined) updatedBody = setDashboardTaskAssignee(updatedBody, taskId, changes.assignee)
    const updated = await this.#request<GitHubIssue>(`/issues/${issueNumber}`, {
      method: 'PATCH',
      body: JSON.stringify({ body: updatedBody }),
    })
    return this.#parseIssue(updated)
  }

  #parseIssue(issue: GitHubIssue): EventDashboard {
    return parseDashboard(issue.body ?? '', issue.number, issue.html_url, issue.updated_at)
  }

  async #request<T>(path: string, init?: RequestInit): Promise<T> {
    let response: Response
    try {
      const fetchRequest = this.#fetch
      response = await fetchRequest(`https://api.github.com/repos/${this.#repository}${path}`, {
        ...init,
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${this.#token}`,
          'Content-Type': 'application/json',
          'User-Agent': 'ichiza-web',
          'X-GitHub-Api-Version': '2022-11-28',
          ...init?.headers,
        },
      })
    } catch (error) {
      throw new GitHubTransportError(error, this.#token)
    }
    if (!response.ok) throw new GitHubRequestError(response.status)
    return (await response.json()) as T
  }
}
