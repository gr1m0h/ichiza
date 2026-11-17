const dashboardMarker = /^<!-- ichiza-dashboard:v1 slug=([a-z0-9][a-z0-9-]*) date=(\d{4}-\d{2}-\d{2}) -->$/
const managedTaskLine =
  /^- \[([ xX])\] \*\*(\d{4}-\d{2}-\d{2})\*\* (.+?)(?: · @([A-Za-z0-9-]+(?: @[A-Za-z0-9-]+)*))? <!-- ichiza-task:(\{.*\}) -->\r?$/
const tasksStart = '<!-- ichiza-tasks:start -->'
const tasksEnd = '<!-- ichiza-tasks:end -->'
const deletedTask = /^<!-- ichiza-deleted-task:([a-z0-9][a-z0-9-]*) -->\r?$/

export interface TaskActivity {
  readonly at: string
  readonly done: boolean
}

interface TaskMetadata {
  readonly id: string
  readonly due: string
  readonly assignees: readonly string[]
  readonly mention_assignees?: boolean
  readonly reminder?: string
  readonly assignee_source?: string
  readonly labels: readonly string[]
  readonly task_source?: 'runtime'
  readonly created_at?: string
  readonly completed_at?: string
  readonly history?: readonly TaskActivity[]
}

export interface DashboardTask extends TaskMetadata {
  readonly title: string
  readonly done: boolean
}

export interface EventDashboard {
  readonly issueNumber: number
  readonly issueUrl: string
  readonly updatedAt?: string
  readonly state?: 'open' | 'closed'
  readonly closedAt?: string
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

export function validTaskTitle(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 200 && !/[\r\n<>\u0000-\u001f]/.test(value) && !/ · @[A-Za-z0-9-]+(?: @[A-Za-z0-9-]+)*$/.test(value.trim())
}

function validTimestamp(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value))
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
    (metadata.task_source !== undefined && metadata.task_source !== 'runtime') ||
    (metadata.created_at !== undefined && !validTimestamp(metadata.created_at)) ||
    (metadata.completed_at !== undefined && !validTimestamp(metadata.completed_at)) ||
    (metadata.history !== undefined && (!Array.isArray(metadata.history) || !metadata.history.every(entry =>
      typeof entry === 'object' && entry !== null && validTimestamp(entry.at) && typeof entry.done === 'boolean'))) ||
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
    if (line === '' || deletedTask.test(line) || (line.startsWith('  ') && parsedTasks.length > 0)) return parsedTasks
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
  create?: { title: string; due: string }
  delete?: boolean
}

export function updateDashboardTasks(body: string, updates: readonly DashboardTaskUpdate[], now = new Date()): string {
  if (new Set(updates.map(update => update.taskId)).size !== updates.length) throw new Error('duplicate task update')
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
    if (update.create) throw new Error('task already exists')
    if (update.delete) {
      lines[i] = `<!-- ichiza-deleted-task:${metadata.id} -->${line.endsWith('\r') ? '\r' : ''}`
      while (i + 1 < end && (lines[i + 1]!.startsWith('  ') || lines[i + 1] === '')) {
        lines[i + 1] = ''
        i++
      }
      continue
    }
    const mark = update.done === undefined ? match[1] : update.done ? 'x' : ' '
    const completionChanged = update.done !== undefined && update.done !== (match[1]?.toLowerCase() === 'x')
    if (!completionChanged && update.assignees === undefined && update.reminder === undefined && update.mentionAssignees === undefined) {
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
      completed_at: completionChanged ? (update.done ? now.toISOString() : undefined) : metadata.completed_at,
      history: completionChanged ? [...(metadata.history ?? []), { at: now.toISOString(), done: update.done! }] : metadata.history,
    }
    const visible = assignees.length ? ` · @${assignees.join(' @')}` : ''
    const cr = line.endsWith('\r') ? '\r' : ''
    lines[i] = `- [${mark}] **${match[2]}** ${match[3]}${visible} <!-- ichiza-task:${JSON.stringify(updatedMetadata)} -->${cr}`
  }
  let insertAt = end
  for (const id of pending.keys()) {
    if (found.has(id)) continue
    const update = pending.get(id)!
    if (!update.create) throw new Error(`task "${id}" not found`)
    if (!/^[a-z0-9][a-z0-9-]*$/.test(id) || lines.some(line => deletedTask.exec(line)?.[1] === id)) throw new Error('invalid or deleted task id')
    const { title, due } = update.create
    if (!validTaskTitle(title) || !due || due === 'off' || !validReminder(due) || update.delete) throw new Error('invalid new task')
    const assignees = update.assignees ?? []
    if (!assignees.every(name => /^[A-Za-z0-9-]+$/.test(name)) || new Set(assignees).size !== assignees.length) throw new Error('invalid assignee')
    if (update.reminder !== undefined && !validReminder(update.reminder)) throw new Error('invalid reminder')
    const metadata = { id, due, labels: [], task_source: 'runtime', created_at: now.toISOString(),
      assignee: assignees.length === 1 ? assignees[0] : undefined,
      assignees: assignees.length > 1 ? assignees : undefined,
      assignee_source: 'runtime', reminder: update.reminder || undefined, mention_assignees: update.mentionAssignees || undefined,
      completed_at: update.done ? now.toISOString() : undefined,
      history: update.done ? [{at: now.toISOString(), done: true}] : undefined,
    }
    const cr = lines[end]!.endsWith('\r') ? '\r' : ''
    const visible = assignees.length ? ` · @${assignees.join(' @')}` : ''
    lines.splice(insertAt++, 0, `- [${update.done ? 'x' : ' '}] **${due}** ${title.trim()}${visible} <!-- ichiza-task:${JSON.stringify(metadata)} -->${cr}`)
  }
  return lines.join('\n')
}
