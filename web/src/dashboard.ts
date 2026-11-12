const dashboardMarker = /^<!-- ichiza-dashboard:v1 slug=([a-z0-9][a-z0-9-]*) date=(\d{4}-\d{2}-\d{2}) -->$/
const managedTaskLine =
  /^- \[([ xX])\] \*\*(\d{4}-\d{2}-\d{2})\*\* (.+?)(?: · @([A-Za-z0-9-]+(?: @[A-Za-z0-9-]+)*))? <!-- ichiza-task:(\{.*\}) -->\r?$/
const tasksStart = '<!-- ichiza-tasks:start -->'
const tasksEnd = '<!-- ichiza-tasks:end -->'

interface TaskMetadata {
  readonly id: string
  readonly due: string
  readonly assignees: readonly string[]
  readonly mention_assignees?: boolean
  readonly reminder?: string
  readonly assignee_source?: string
  readonly labels: readonly string[]
}

export interface DashboardTask extends TaskMetadata {
  readonly title: string
  readonly done: boolean
}

export interface EventDashboard {
  readonly issueNumber: number
  readonly issueUrl: string
  readonly updatedAt?: string
  readonly slug: string
  readonly title: string
  readonly date: string
  readonly tasks: readonly DashboardTask[]
  readonly body: string
}

export function validReminder(value: unknown): value is string {
  if (value === '' || value === 'off') return true
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const day = new Date(value + 'T00:00:00Z')
  return Number.isFinite(day.valueOf()) && day.toISOString().slice(0, 10) === value
}

function parseMetadata(value: string): TaskMetadata {
  const parsed: unknown = JSON.parse(value)
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('invalid task metadata')
  }
  const metadata = parsed as Record<string, unknown>
  const labels = metadata.labels ?? []
  if (
    typeof metadata.id !== 'string' ||
    typeof metadata.due !== 'string' ||
    (metadata.assignee !== undefined && typeof metadata.assignee !== 'string') ||
    (metadata.assignee !== undefined && metadata.assignees !== undefined) ||
    (metadata.mention_assignees !== undefined && typeof metadata.mention_assignees !== 'boolean') ||
    (metadata.reminder !== undefined && !validReminder(metadata.reminder)) ||
    !Array.isArray(labels) ||
    !labels.every((label) => typeof label === 'string')
  ) {
    throw new Error('invalid task metadata')
  }
  const { assignee, ...fields } = metadata
  const assignees = metadata.assignees ?? (assignee ? [assignee] : [])
  if (!Array.isArray(assignees) || !assignees.every(name => typeof name === 'string' && /^[A-Za-z0-9-]+$/.test(name)) ||
      new Set(assignees).size !== assignees.length) throw new Error('invalid assignees')
  return {
    ...fields,
    assignees,
    id: metadata.id,
    due: metadata.due,
    labels,
  }
}

function parseTask(line: string): DashboardTask | undefined {
  const match = managedTaskLine.exec(line)
  if (match === null) return undefined
  const [, mark, visibleDue, title, visibleAssignee, rawMetadata] = match
  if (rawMetadata === undefined) throw new Error('invalid task metadata')
  const metadata = parseMetadata(rawMetadata)
  if (metadata.assignee_source !== undefined && metadata.assignee_source !== 'runtime') {
    throw new Error(`task "${metadata.id}" has unsupported assignee source`)
  }
  if (visibleDue !== metadata.due || (visibleAssignee ?? '') !== metadata.assignees.join(' @')) {
    throw new Error(`task "${metadata.id}" visible metadata does not match marker`)
  }
  return { ...metadata, title: title ?? '', done: mark?.toLowerCase() === 'x' }
}

export function parseDashboard(
  body: string,
  issueNumber: number,
  issueUrl: string,
  updatedAt?: string,
): EventDashboard {
  const lines = body.replaceAll('\r\n', '\n').split('\n')
  const marker = dashboardMarker.exec(lines[0] ?? '')
  if (marker === null) throw new Error('missing dashboard marker')
  const date = marker[2] ?? ''
  const parsedDate = new Date(`${date}T00:00:00Z`)
  if (Number.isNaN(parsedDate.valueOf()) || parsedDate.toISOString().slice(0, 10) !== date) {
    throw new Error('invalid event date')
  }
  const start = lines.indexOf(tasksStart)
  const end = lines.indexOf(tasksEnd)
  if (start < 0 || end <= start) throw new Error('missing dashboard task markers')
  const title = lines.find((line) => line.startsWith('# '))?.slice(2) ?? ''
  const tasks = lines.slice(start + 1, end).reduce<readonly DashboardTask[]>((parsedTasks, line) => {
    const parsed = parseTask(line)
    if (parsed !== undefined) return [...parsedTasks, parsed]
    if (line === '' || (line.startsWith('  ') && parsedTasks.length > 0)) return parsedTasks
    throw new Error(`invalid managed task line: ${line}`)
  }, [])
  const ids = tasks.map((task) => task.id)
  if (new Set(ids).size !== ids.length) throw new Error('duplicate task id')
  return {
    issueNumber,
    issueUrl,
    updatedAt,
    slug: marker[1] ?? '',
    title,
    date,
    tasks,
    body,
  }
}

export interface DashboardTaskUpdate {
  taskId: string
  done?: boolean
  assignees?: readonly string[]
  reminder?: string
  mentionAssignees?: boolean
}

export function updateDashboardTasks(body: string, updates: readonly DashboardTaskUpdate[]): string {
  const pending = new Map(updates.map(update => [update.taskId, update]))
  const lines = body.split('\n')
  const start = lines.findIndex(line => line.trimEnd() === tasksStart)
  const end = lines.findIndex(line => line.trimEnd() === tasksEnd)
  if (start < 0 || end <= start) throw new Error('missing dashboard task markers')
  const found = new Set<string>()
  for (let i = start + 1; i < end; i++) {
    const line = lines[i]!
    const match = managedTaskLine.exec(line)
    if (!match?.[5]) continue
    const metadata = parseMetadata(match[5])
    const update = pending.get(metadata.id)
    if (!update) continue
    if (found.has(metadata.id)) throw new Error(`duplicate task id "${metadata.id}"`)
    found.add(metadata.id)
    const mark = update.done === undefined ? match[1] : update.done ? 'x' : ' '
    if (update.assignees === undefined && update.reminder === undefined && update.mentionAssignees === undefined) {
      lines[i] = line.slice(0, 3) + mark + line.slice(4)
      continue
    }
    const assignees = update.assignees ?? metadata.assignees
    if (!assignees.every(name => /^[A-Za-z0-9-]+$/.test(name)) || new Set(assignees).size !== assignees.length) throw new Error('invalid assignee')
    const reminder = update.reminder ?? metadata.reminder ?? ''
    if (!validReminder(reminder)) throw new Error('invalid reminder')
    const updatedMetadata = {
      ...metadata,
      assignee: assignees.length === 1 ? assignees[0] : undefined,
      assignees: assignees.length > 1 ? assignees : undefined,
      assignee_source: update.assignees !== undefined ? 'runtime' : metadata.assignee_source,
      reminder: reminder || undefined,
      mention_assignees: (update.mentionAssignees ?? metadata.mention_assignees) || undefined,
    }
    const visible = assignees.length ? ` · @${assignees.join(' @')}` : ''
    const cr = line.endsWith('\r') ? '\r' : ''
    lines[i] = `- [${mark}] **${match[2]}** ${match[3]}${visible} <!-- ichiza-task:${JSON.stringify(updatedMetadata)} -->${cr}`
  }
  for (const id of pending.keys()) {
    if (!found.has(id)) throw new Error(`task "${id}" not found`)
  }
  return lines.join('\n')
}
