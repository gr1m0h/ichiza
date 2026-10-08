const dashboardMarker = /^<!-- ichiza-dashboard:v1 slug=([a-z0-9][a-z0-9-]*) date=(\d{4}-\d{2}-\d{2}) -->$/
const managedTaskLine =
  /^- \[([ xX])\] \*\*(\d{4}-\d{2}-\d{2})\*\* (.+?)(?: · @([A-Za-z0-9-]+))? <!-- ichiza-task:(\{.*\}) -->\r?$/
const tasksStart = '<!-- ichiza-tasks:start -->'
const tasksEnd = '<!-- ichiza-tasks:end -->'

interface TaskMetadata {
  readonly id: string
  readonly due: string
  readonly assignee?: string
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
    !Array.isArray(labels) ||
    !labels.every((label) => typeof label === 'string')
  ) {
    throw new Error('invalid task metadata')
  }
  return {
    id: metadata.id,
    due: metadata.due,
    assignee: metadata.assignee,
    labels,
  } as TaskMetadata
}

function parseTask(line: string): DashboardTask | undefined {
  const match = managedTaskLine.exec(line)
  if (match === null) return undefined
  const [, mark, visibleDue, title, visibleAssignee, rawMetadata] = match
  if (rawMetadata === undefined) throw new Error('invalid task metadata')
  const metadata = parseMetadata(rawMetadata)
  if (visibleDue !== metadata.due || visibleAssignee !== metadata.assignee) {
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

export function toggleDashboardTask(body: string, taskId: string, done: boolean): string {
  let matches = 0
  const lines = body.split('\n').map((line) => {
    const match = managedTaskLine.exec(line)
    if (match === null || match[5] === undefined) return line
    const metadata = parseMetadata(match[5])
    if (metadata.id !== taskId) return line
    matches += 1
    return `${line.slice(0, 3)}${done ? 'x' : ' '}${line.slice(4)}`
  })
  if (matches === 0) throw new Error(`task "${taskId}" not found`)
  if (matches > 1) throw new Error(`duplicate task id "${taskId}"`)
  return lines.join('\n')
}

export function setDashboardTaskAssignee(body: string, taskId: string, assignee: string): string {
  if (assignee !== '' && !/^[A-Za-z0-9-]+$/.test(assignee)) throw new Error('invalid assignee')
  let matches = 0
  const lines = body.split('\n').map((line) => {
    const match = managedTaskLine.exec(line)
    if (match === null || match[5] === undefined) return line
    const metadata = parseMetadata(match[5])
    if (metadata.id !== taskId) return line
    matches += 1
    const updatedMetadata = { ...metadata, assignee: assignee === '' ? undefined : assignee }
    const metadataValue = JSON.stringify(updatedMetadata)
    const visibleAssignee = updatedMetadata.assignee === undefined ? '' : ` · @${updatedMetadata.assignee}`
    const carriageReturn = line.endsWith('\r') ? '\r' : ''
    return `- [${match[1]}] **${match[2]}** ${match[3]}${visibleAssignee} <!-- ichiza-task:${metadataValue} -->${carriageReturn}`
  })
  if (matches === 0) throw new Error(`task "${taskId}" not found`)
  if (matches > 1) throw new Error(`duplicate task id "${taskId}"`)
  return lines.join('\n')
}
