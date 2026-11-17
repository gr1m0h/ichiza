import { type EventDashboard, type TaskActivity, validReminder } from './dashboard'

export const recordLabel = 'ichiza:metrics'
const aggregateMarker = '<!-- ichiza-metrics:v1 -->'

export interface RecordedTask {
  readonly id: string
  readonly title: string
  readonly due: string
  readonly done: boolean
  readonly assignees: readonly string[]
  readonly completedAt?: string
  readonly history: readonly TaskActivity[]
}

export interface RecordSnapshot {
  readonly version: 1
  readonly slug: string
  readonly title: string
  readonly date: string
  readonly sourceIssueNumber: number
  readonly sourceIssueUrl: string
  readonly sourceUpdatedAt: string
  readonly capturedAt: string
  readonly timeZone: string
  readonly tasks: readonly RecordedTask[]
  readonly removedTaskIds: readonly string[]
}

export interface EventMetrics {
  readonly slug: string
  readonly title: string
  readonly date: string
  readonly sourceIssueNumber: number
  readonly sourceIssueUrl: string
  readonly sourceUpdatedAt: string
  readonly closedAt: string | null
  readonly metrics: ReturnType<typeof recordMetrics>
}

export interface AggregateSnapshot {
  readonly version: 1
  readonly capturedAt: string
  readonly timeZone: string
  readonly year: string
  readonly events: readonly EventMetrics[]
}

export interface AggregateRecord {
  readonly issueNumber: number
  readonly issueUrl: string
  readonly updatedAt: string
  readonly snapshot: AggregateSnapshot
  readonly body: string
}

export interface RecordRevision {
  readonly issueNumber: number
  readonly updatedAt: string
}

export interface RecordRepository {
  loadAggregate(): Promise<AggregateRecord | undefined>
  saveAggregate(snapshot: AggregateSnapshot, expected: RecordRevision | null): Promise<AggregateRecord>
}

export class RecordConflictError extends Error {
  constructor() { super('record or source dashboard changed; preview again'); this.name = 'RecordConflictError' }
}

export function localDate(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now)
  const values = Object.fromEntries(parts.map(({type,value}) => [type,value]))
  return `${values.year}-${values.month}-${values.day}`
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const isString = (value: unknown): value is string => typeof value === 'string'
const isDay = (value: unknown): value is string => isString(value) && value !== '' && value !== 'off' && validReminder(value)
const isTimestamp = (value: unknown): value is string => isString(value) && isDay(value.slice(0,10)) && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value))
const isStrings = (value: unknown): value is string[] => Array.isArray(value) && value.every(isString)
const isId = (value: string) => /^[a-z0-9][a-z0-9-]*$/.test(value)

export function validateSnapshot(value: unknown): RecordSnapshot {
  if (!isObject(value) || value.version !== 1 || !isString(value.slug) || !isId(value.slug) || !isString(value.title) || !value.title.trim() ||
      !isDay(value.date) || !Number.isSafeInteger(value.sourceIssueNumber) || Number(value.sourceIssueNumber) <= 0 ||
      !isString(value.sourceIssueUrl) || !/^https:\/\/[^\s<>]+$/.test(value.sourceIssueUrl) ||
      !isTimestamp(value.sourceUpdatedAt) || !isTimestamp(value.capturedAt) || !isString(value.timeZone) ||
      !isStrings(value.removedTaskIds) || !value.removedTaskIds.every(isId) || !Array.isArray(value.tasks)) throw new Error('invalid record snapshot')
  // Validate the timezone before accepting imported data or rendering dates.
  localDate(new Date(value.capturedAt), value.timeZone)
  const tasks: RecordedTask[] = value.tasks.map(task => {
    if (!isObject(task) || !isString(task.id) || !isId(task.id) || !isString(task.title) || !task.title.trim() || !isDay(task.due) ||
        typeof task.done !== 'boolean' || !isStrings(task.assignees) || !task.assignees.every(name => /^[A-Za-z0-9-]+$/.test(name)) ||
        new Set(task.assignees).size !== task.assignees.length || (task.completedAt !== undefined && !isTimestamp(task.completedAt)) ||
        !Array.isArray(task.history)) throw new Error('invalid recorded task')
    const history: TaskActivity[] = task.history.map(activity => {
      if (!isObject(activity) || !isTimestamp(activity.at) || typeof activity.done !== 'boolean') throw new Error('invalid recorded activity')
      return {at:activity.at, done:activity.done}
    })
    return {id:task.id, title:task.title, due:task.due, done:task.done, assignees:[...task.assignees], completedAt:task.completedAt, history}
  })
  const ids = [...tasks.map(task => task.id), ...value.removedTaskIds]
  if (new Set(ids).size !== ids.length) throw new Error('duplicate recorded task id')
  return {version:1,slug:value.slug,title:value.title,date:value.date,sourceIssueNumber:Number(value.sourceIssueNumber),
    sourceIssueUrl:value.sourceIssueUrl,sourceUpdatedAt:value.sourceUpdatedAt,capturedAt:value.capturedAt,timeZone:value.timeZone,tasks,removedTaskIds:[...value.removedTaskIds]}
}

export function createSnapshot(dashboard: EventDashboard, timeZone: string, capturedAt: string): RecordSnapshot {
  const range = dashboard.body.split('<!-- ichiza-tasks:start -->')[1]?.split('<!-- ichiza-tasks:end -->')[0] ?? ''
  return validateSnapshot({version:1,slug:dashboard.slug,title:dashboard.title,date:dashboard.date,
    sourceIssueNumber:dashboard.issueNumber,sourceIssueUrl:dashboard.issueUrl,sourceUpdatedAt:dashboard.updatedAt,
    capturedAt,timeZone, tasks:dashboard.tasks.map(task => ({id:task.id,title:task.title,due:task.due,done:task.done,
      assignees:task.assignees,completedAt:task.completed_at,history:task.history ?? []})),
    removedTaskIds:[...range.matchAll(/^<!-- ichiza-deleted-task:([a-z0-9][a-z0-9-]*) -->\r?$/gm)].map(match => match[1]),
  })
}

export function delayDays(task: RecordedTask, snapshot: RecordSnapshot): number | null {
  if (task.done && !task.completedAt) return null
  const day = localDate(new Date(task.done ? task.completedAt! : snapshot.capturedAt), snapshot.timeZone)
  return Math.max(0, Math.round((Date.parse(day) - Date.parse(task.due)) / 86400000))
}

// Metric definitions are part of the v1 snapshot contract. Unknown completion
// times are excluded from deadline and delay rates, and shown as coverage.
export function recordMetrics(snapshot: RecordSnapshot) {
  const done = snapshot.tasks.filter(task => task.done)
  const known = done.filter(task => task.completedAt)
  const late = known.filter(task => delayDays(task,snapshot)! > 0)
  const date = localDate(new Date(snapshot.capturedAt),snapshot.timeZone)
  return {total:snapshot.tasks.length,completed:done.length,open:snapshot.tasks.length-done.length,
    overdue:snapshot.tasks.filter(task => !task.done && task.due < date).length,
    onTime:known.length-late.length,late:late.length,unknown:done.length-known.length,known:known.length,
    completionRate:snapshot.tasks.length ? Math.round(done.length/snapshot.tasks.length*100) : null,
    onTimeRate:known.length ? Math.round((known.length-late.length)/known.length*100) : null,
    lateDays:late.reduce((sum,task) => sum+delayDays(task,snapshot)!,0),
    averageDelayDays:known.length ? (late.length ? Math.round(late.reduce((sum,task) => sum+delayDays(task,snapshot)!,0)/late.length*10)/10 : 0) : null,
    maxDelayDays:known.length ? Math.max(0,...known.map(task => delayDays(task,snapshot)!)) : null,
    reopened:snapshot.tasks.filter(task => task.history.some(entry => !entry.done)).length,
    reopenEvents:snapshot.tasks.reduce((sum,task) => sum+task.history.filter(entry => !entry.done).length,0),
    removed:snapshot.removedTaskIds.length}
}

function md(value: string): string {
  return value.replace(/([\\`*_[\]{}|#])/g,'\\$1').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/@/g,'&#64;').replace(/[\r\n]+/g,' ')
}
const rate = (value: number | null) => value === null ? '未記録' : `${value}%`

function metricsMarkdown(m: ReturnType<typeof recordMetrics>): string {
  return `| 指標 | 結果 |\n| --- | ---: |\n| タスク完了 | ${m.completed} / ${m.total}（${rate(m.completionRate)}） |\n| 未完了 / 期限超過 | ${m.open} / ${m.overdue} |\n| 期日内 / 期日後に完了 | ${m.onTime} / ${m.late} |\n| 期日内完了率（日時ありのみ） | ${rate(m.onTimeRate)} |\n| 完了日時の記録 | ${m.known} / ${m.completed} |\n| 平均超過日数（期日後完了のみ） | ${m.averageDelayDays ?? '未記録'} |\n| 最大超過日数（完了済み） | ${m.maxDelayDays ?? '未記録'} |\n| 再開タスク / 再開回数 | ${m.reopened} / ${m.reopenEvents} |\n| 削除タスク（集計対象外） | ${m.removed} |`
}

export function renderRecord(snapshot: RecordSnapshot): string {
  const rows=snapshot.tasks.map(task=>`| ${md(task.title)} | ${task.done?'完了':'未完了'} | ${task.due} | ${task.completedAt ?? '未記録'} | ${delayDays(task,snapshot) ?? '未記録'} | ${task.assignees.map(name=>'`'+name+'`').join(', ')||'—'} |`)
  return `# ${md(snapshot.title)}\n\n${snapshot.date} 開催 · ${snapshot.capturedAt} 時点（${snapshot.timeZone}）\n\n[Event Hub Issue](${snapshot.sourceIssueUrl})\n\n## メトリクス\n\n${metricsMarkdown(recordMetrics(snapshot))}\n\n## タスク\n\n| タスク | 状態 | 期日 | 完了日時 | 超過日数 | 担当者 |\n| --- | --- | --- | --- | ---: | --- |\n${rows.join('\n')}\n`
}

export function closedSnapshots(dashboards: readonly EventDashboard[], timeZone: string): readonly RecordSnapshot[] {
  return dashboards.filter(event=>event.state==='closed').map(event=>createSnapshot(event,timeZone,event.closedAt ?? event.updatedAt!))
}

export function validYear(year: string): boolean { return year === 'all' || /^\d{4}$/.test(year) }

export function createAggregate(dashboards: readonly EventDashboard[], timeZone: string, capturedAt: string, year = 'all'): AggregateSnapshot {
  if (!validYear(year)) throw new Error('invalid metrics year')
  const events=closedSnapshots(dashboards,timeZone).filter(event=>year==='all'||event.date.startsWith(year+'-')).map(event=>({
    slug:event.slug,title:event.title,date:event.date,sourceIssueNumber:event.sourceIssueNumber,sourceIssueUrl:event.sourceIssueUrl,
    sourceUpdatedAt:event.sourceUpdatedAt,closedAt:dashboards.find(source=>source.issueNumber===event.sourceIssueNumber)?.closedAt ?? null,metrics:recordMetrics(event),
  })).toSorted((a,b)=>a.date.localeCompare(b.date)||a.sourceIssueNumber-b.sourceIssueNumber)
  return {version:1,capturedAt,timeZone,year,events}
}

function combinedMetrics(events: readonly EventMetrics[]) {
  const sum=(key:'total'|'completed'|'open'|'overdue'|'onTime'|'late'|'unknown'|'known'|'reopened'|'reopenEvents'|'removed'|'lateDays')=>events.reduce((value,event)=>value+event.metrics[key],0)
  const total=sum('total'),completed=sum('completed'),known=sum('known'),late=sum('late'),onTime=sum('onTime'),lateDays=sum('lateDays')
  return {total,completed,open:sum('open'),overdue:sum('overdue'),onTime,late,unknown:sum('unknown'),known,
    completionRate:total?Math.round(completed/total*100):null,onTimeRate:known?Math.round(onTime/known*100):null,
    lateDays,averageDelayDays:known?(late?Math.round(lateDays/late*10)/10:0):null,
    maxDelayDays:known?Math.max(0,...events.map(event=>event.metrics.maxDelayDays??0)):null,
    reopened:sum('reopened'),reopenEvents:sum('reopenEvents'),removed:sum('removed')}
}
export function aggregateMetrics(snapshot: AggregateSnapshot) { return combinedMetrics(snapshot.events) }

export function validateAggregate(value: unknown): AggregateSnapshot {
  if (!isObject(value)||value.version!==1||!isTimestamp(value.capturedAt)||!isString(value.timeZone)||!isString(value.year)||!validYear(value.year)||!Array.isArray(value.events)) throw new Error('invalid aggregate snapshot')
  localDate(new Date(value.capturedAt),value.timeZone)
  const keys=['total','completed','open','overdue','onTime','late','unknown','known','lateDays','reopened','reopenEvents','removed'] as const
  const events:EventMetrics[]=value.events.map(event=>{
    if(!isObject(event)||!isString(event.slug)||!isId(event.slug)||!isString(event.title)||!isDay(event.date)||!Number.isSafeInteger(event.sourceIssueNumber)||Number(event.sourceIssueNumber)<=0||!isString(event.sourceIssueUrl)||!/^https:\/\/[^\s<>]+$/.test(event.sourceIssueUrl)||!isTimestamp(event.sourceUpdatedAt)||(event.closedAt!==null&&!isTimestamp(event.closedAt))||!isObject(event.metrics)) throw new Error('invalid aggregate event')
    const m=event.metrics
    if(!keys.every(key=>typeof m[key]==='number'&&Number.isSafeInteger(m[key])&&Number(m[key])>=0)||
       (m.maxDelayDays!==null&&(!Number.isSafeInteger(m.maxDelayDays)||Number(m.maxDelayDays)<0)))throw new Error('invalid aggregate metrics')
    const typed=m as unknown as ReturnType<typeof recordMetrics>
    const normalized=combinedMetrics([{metrics:typed} as EventMetrics])
    if(typed.total!==typed.completed+typed.open||typed.completed!==typed.known+typed.unknown||typed.known!==typed.onTime+typed.late||typed.overdue>typed.open||typed.reopened>typed.total||typed.reopenEvents<typed.reopened||typed.lateDays<typed.late||(typed.late===0&&typed.lateDays!==0)||
       ['completionRate','onTimeRate','averageDelayDays','maxDelayDays'].some(key=>m[key]!==normalized[key as keyof typeof normalized]))throw new Error('inconsistent aggregate metrics')
    return {slug:event.slug,title:event.title,date:event.date,sourceIssueNumber:Number(event.sourceIssueNumber),sourceIssueUrl:event.sourceIssueUrl,sourceUpdatedAt:event.sourceUpdatedAt,closedAt:event.closedAt as string|null,metrics:normalized}
  })
  if(new Set(events.map(event=>event.sourceIssueNumber)).size!==events.length||new Set(events.map(event=>event.slug)).size!==events.length)throw new Error('duplicate aggregate event')
  return {version:1,capturedAt:value.capturedAt,timeZone:value.timeZone,year:value.year,events}
}

export function renderAggregate(snapshot: AggregateSnapshot): string {
  const data=JSON.stringify(snapshot).replaceAll('<','\\u003c').replaceAll('>','\\u003e').replaceAll('&','\\u0026').replaceAll('\u2028','\\u2028').replaceAll('\u2029','\\u2029')
  const rows=snapshot.events.map(event=>`| [${md(event.title)}](${event.sourceIssueUrl}) | ${event.date} | ${event.metrics.completed}/${event.metrics.total} | ${rate(event.metrics.onTimeRate)} | ${event.metrics.known}/${event.metrics.completed} | ${event.metrics.averageDelayDays??'未記録'} | ${event.metrics.reopenEvents} |`)
  return `${aggregateMarker}\n<!-- ichiza-metrics-data:${data} -->\n# ichiza Insights\n\n${snapshot.year==='all'?'全期間':snapshot.year+'年'} · Closedイベント ${snapshot.events.length}件 · ${snapshot.capturedAt} 時点（${snapshot.timeZone}）\n\n## 全体集計\n\n${metricsMarkdown(aggregateMetrics(snapshot))}\n\n## イベント比較\n\n| イベント | 開催日 | 完了 | 期日内完了率 | 日時記録 | 平均超過日数 | 再開回数 |\n| --- | --- | ---: | ---: | ---: | ---: | ---: |\n${rows.join('\n')}\n\n期日内完了率の分母は完了日時のあるタスクです。平均超過日数は期日後に完了したタスクのみが対象で、イベント間の平均値を単純平均せずタスク数で集計しています。各イベントはCloseされたEvent Hub Issueの現在の内容から集計し、超過日数はClose日時（不明なら更新日時）を基準にしています。着手・待ち時間・工数は未計測です。\n`
}

export function parseAggregate(body:string,issueNumber:number,issueUrl:string,updatedAt:string):AggregateRecord {
  const lines=body.replaceAll('\r\n','\n').split('\n')
  const match=/^<!-- ichiza-metrics-data:(\{.*\}) -->$/.exec(lines[1]??'')
  if(lines[0]!==aggregateMarker||!match?.[1])throw new Error('invalid aggregate markers')
  return {issueNumber,issueUrl,updatedAt,snapshot:validateAggregate(JSON.parse(match[1])),body}
}

export function recordTitle(): string { return '[ichiza] Insights' }

export function metricsCsv(events:readonly EventMetrics[],capturedAt:string,timeZone:string):string {
  const header=['event','event_date','captured_at','timezone','source_issue','total','completed','open','overdue','on_time','late','unknown_completion','completion_percent','on_time_percent_known_only','completion_time_known','average_late_days','max_delay_days','reopened_tasks','reopen_events','removed_tasks']
  const cell=(value:unknown)=>{const text=String(value??'');return '"'+(/^\s*[=+\-@]|^[\t\r\n]/.test(text)?"'":'')+text.replaceAll('"','""')+'"'}
  const rows=events.map(event=>{const m=event.metrics;return [event.title,event.date,capturedAt,timeZone,event.sourceIssueUrl,m.total,m.completed,m.open,m.overdue,m.onTime,m.late,m.unknown,m.completionRate,m.onTimeRate,m.known,m.averageDelayDays,m.maxDelayDays,m.reopened,m.reopenEvents,m.removed]})
  return '\ufeff'+[header,...rows].map(row=>row.map(cell).join(',')).join('\r\n')+'\r\n'
}
export function recordsCsv(snapshots:readonly RecordSnapshot[]):string {
  return metricsCsv(snapshots.map(event=>({...event,closedAt:null,metrics:recordMetrics(event)})),snapshots[0]?.capturedAt??'',snapshots[0]?.timeZone??'')
}
