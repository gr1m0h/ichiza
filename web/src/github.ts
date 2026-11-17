import { type EventDashboard, type DashboardTaskUpdate, parseDashboard, updateDashboardTasks } from './dashboard'
import { createAggregate, parseAggregate, recordLabel, recordTitle, renderAggregate, RecordConflictError, type AggregateRecord, type AggregateSnapshot, type RecordRevision } from './records'

interface GitHubIssue {
  readonly number: number
  readonly html_url: string
  readonly updated_at: string
  readonly body: string | null
  readonly state?: 'open' | 'closed'
  readonly closed_at?: string | null
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
    return (await this.#listIssues('ichiza:event')).map(issue => this.#parseIssue(issue))
  }

  async #listIssues(label: string): Promise<readonly GitHubIssue[]> {
    const basePath = `/issues?state=all&labels=${encodeURIComponent(label)}&per_page=100`
    let issues: readonly GitHubIssue[] = []
    let pageNumber = 1
    while (true) {
      const path = pageNumber === 1 ? basePath : `${basePath}&page=${pageNumber}`
      const page = await this.#request<readonly GitHubIssue[]>(path)
      issues = [...issues, ...page]
      if (page.length < 100) break
      pageNumber += 1
    }
    return issues.filter(issue => issue.pull_request === undefined)
  }

  async loadAggregate(): Promise<AggregateRecord | undefined> {
    const issues=(await this.#listIssues(recordLabel)).filter(issue=>issue.body?.startsWith('<!-- ichiza-metrics:v1 -->'))
    if(issues.length>1)throw new RecordConflictError()
    const issue=issues[0]
    return issue?parseAggregate(issue.body!,issue.number,issue.html_url,issue.updated_at):undefined
  }

  async saveAggregate(snapshot: AggregateSnapshot, expected: RecordRevision | null): Promise<AggregateRecord> {
    // Recompute from every currently Closed event. This also detects newly
    // closed/reopened events, rather than validating only previously seen IDs.
    const current=createAggregate(await this.listDashboards(),snapshot.timeZone,snapshot.capturedAt,snapshot.year)
    if(JSON.stringify(current)!==JSON.stringify(snapshot))throw new RecordConflictError()
    const existing=await this.loadAggregate()
    if(existing?.issueNumber!==expected?.issueNumber||existing?.updatedAt!==expected?.updatedAt)throw new RecordConflictError()
    return this.#writeAggregate(snapshot,existing)
  }

  async syncAggregate(timeZone:string|undefined=undefined,now=new Date()):Promise<AggregateRecord> {
    const [dashboards,existing]=await Promise.all([this.listDashboards(),this.loadAggregate()])
    const zone=timeZone||existing?.snapshot.timeZone||'Asia/Tokyo'
    const snapshot=createAggregate(dashboards,zone,now.toISOString(),'all')
    if(existing&&existing.snapshot.year==='all'&&existing.snapshot.timeZone===zone&&JSON.stringify(existing.snapshot.events)===JSON.stringify(snapshot.events))return existing
    return this.#writeAggregate(snapshot,existing)
  }

  async getDashboard(issueNumber:number):Promise<EventDashboard|undefined>{
    if(!Number.isSafeInteger(issueNumber)||issueNumber<=0)throw new Error('invalid issue number')
    try{
      const issue=await this.#request<GitHubIssue>(`/issues/${issueNumber}`)
      if(issue.pull_request!==undefined)return undefined
      return this.#parseIssue(issue)
    }catch(error){if(error instanceof GitHubRequestError&&error.status===404)return undefined;throw error}
  }

  async #writeAggregate(snapshot:AggregateSnapshot,existing?:AggregateRecord):Promise<AggregateRecord>{
    if(existing){
      const latest=await this.#request<GitHubIssue>(`/issues/${existing.issueNumber}`)
      if(latest.updated_at!==existing.updatedAt||latest.body!==existing.body||latest.pull_request!==undefined)throw new RecordConflictError()
    }
    const body=renderAggregate(snapshot)
    if(body.length>60000)throw new Error('metrics index exceeds 60000 characters')
    const fields={title:recordTitle(),body}
    let saved:GitHubIssue
    if(existing){
      saved=await this.#request<GitHubIssue>(`/issues/${existing.issueNumber}`,{method:'PATCH',body:JSON.stringify(fields)})
    }else{
      await this.#ensureRecordLabel()
      saved=await this.#request<GitHubIssue>('/issues',{method:'POST',body:JSON.stringify({...fields,labels:[recordLabel]})})
    }
    return parseAggregate(saved.body??'',saved.number,saved.html_url,saved.updated_at)
  }

  async #ensureRecordLabel(): Promise<void> {
    const path = `/labels/${encodeURIComponent(recordLabel)}`
    try { await this.#request(path); return } catch (error) {
      if (!(error instanceof GitHubRequestError) || error.status !== 404) throw error
    }
    try {
      await this.#request('/labels',{method:'POST',body:JSON.stringify({name:recordLabel,color:'b8ace4',description:'ichiza cross-event operational metrics'})})
    } catch (error) {
      // Another operator may have created the label between GET and POST.
      if (!(error instanceof GitHubRequestError) || error.status !== 422) throw error
      await this.#request(path)
    }
  }

  async updateTasks(
    issueNumber: number,
    updates: readonly DashboardTaskUpdate[],
    expectedUpdatedAt: string,
  ): Promise<EventDashboard> {
    const issue = await this.#request<GitHubIssue>(`/issues/${issueNumber}`)
    if (issue.updated_at !== expectedUpdatedAt) throw new DashboardConflictError()
    const updatedBody = updateDashboardTasks(issue.body ?? '', updates)
    const updated = await this.#request<GitHubIssue>(`/issues/${issueNumber}`, {
      method: 'PATCH',
      body: JSON.stringify({ body: updatedBody }),
    })
    return this.#parseIssue(updated)
  }

  #parseIssue(issue: GitHubIssue): EventDashboard {
    return {...parseDashboard(issue.body ?? '',issue.number,issue.html_url,issue.updated_at),state:issue.state ?? 'open',closedAt:issue.closed_at ?? undefined}
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
