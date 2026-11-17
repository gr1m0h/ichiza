import { pageHeader } from './page-header'
import { aggregateMetrics, delayDays, localDate, recordMetrics, type AggregateRecord, type AggregateSnapshot, type RecordSnapshot } from './records'

const h=(value:string)=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!))
const percent=(value:number|null)=>value===null?'—':`${value}%`
const date=(at:string,zone:string)=>localDate(new Date(at),zone)
const toolbarIcon=(paths:string)=>`<svg class="toolbar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`
const downloadIcon=toolbarIcon('<path d="M12 3v12m-4-4 4 4 4-4M5 16v4h14v-4"/>')
const calendarIcon=toolbarIcon('<rect x="4" y="5" width="16" height="16" rx="3"/><path d="M8 3v4m8-4v4M4 11h16"/>')
const chevronIcon=toolbarIcon('<path d="m8 10 4 4 4-4"/>')

function exportControls(action:string,year?:string):string{
  return `<form class="export-actions" method="get" action="${h(action)}" aria-label="メトリクスをダウンロード">${year===undefined?'':`<input type="hidden" name="year" value="${h(year)}">`}${[{value:'csv',label:'CSV'},{value:'markdown',label:'Markdown'}].map(format=>`<button type="submit" name="format" value="${format.value}" title="${format.label}をダウンロード" aria-label="${format.label}をダウンロード">${downloadIcon}<span>${format.label}</span></button>`).join('')}</form>`
}

const periodScript=`<script>document.querySelector('[data-period-filter]').addEventListener('change',function(){this.requestSubmit()})</script>`

function metricsView(m:ReturnType<typeof recordMetrics>,eventCount?:number):string{
  return `<div class="result-metrics">${eventCount===undefined?'':`<div><span>Closedイベント</span><strong>${eventCount}<small>件</small></strong><small>${m.total} タスク</small></div>`}<div><span>完了率</span><strong>${percent(m.completionRate)}</strong><small>${m.completed} / ${m.total} タスク</small></div><div><span>期日内完了率</span><strong>${percent(m.onTimeRate)}</strong><small>日時あり ${m.known} / ${m.completed}</small></div><div><span>平均超過</span><strong>${m.averageDelayDays??'—'}<small>日</small></strong><small>期日後完了 ${m.late}件</small></div>${eventCount===undefined?`<div><span>再開</span><strong>${m.reopenEvents}<small>回</small></strong><small>${m.reopened} タスク</small></div>`:''}</div><div class="result-chips"><span>${m.onTime} 期日内</span><span>${m.late} 期日後</span><span>${m.unknown} 日時なし</span>${eventCount!==undefined?`<span>${m.reopenEvents} 再開</span>`:''}${m.open?`<span class="danger">${m.open} 未完了</span>`:''}${m.overdue?`<span class="danger">${m.overdue} 期限超過</span>`:''}${m.removed?`<span>${m.removed} 削除</span>`:''}</div>`
}

function breakdown(m:ReturnType<typeof recordMetrics>):string{
  const parts=[{label:'期日内',count:m.onTime,color:'on-time'},{label:'期日後',count:m.late,color:'late'},{label:'日時なし',count:m.unknown,color:'unknown'}]
  return `<section class="insight-card"><header class="panel-heading"><h2>完了内訳</h2><span class="subtle">${m.completed}件</span></header><div class="completion-breakdown" role="img" aria-label="期日内 ${m.onTime}件、期日後 ${m.late}件、日時未記録 ${m.unknown}件">${parts.map(p=>`<span class="${p.color}" style="flex-grow:${p.count}"></span>`).join('')}${!m.completed?'<span class="no-completions"></span>':''}</div><div class="breakdown-legend">${parts.map(p=>`<div><span class="legend-dot ${p.color}"></span><span>${p.label}</span><strong>${p.count}</strong></div>`).join('')}</div></section>`
}

const method=`<details class="record-method"><summary>ⓘ 集計条件</summary><p>期日内完了率は完了日時ありのみ、平均超過は期日後完了のみが対象です。全体集計はタスク数で重み付けし、イベントごとの率や平均値の単純平均は使いません。超過はClose日時（不明なら更新日時）を基準にします。再開はWebで記録された操作のみです。着手・待ち時間・工数は未計測です。</p></details>`


export function aggregateView(snapshot:AggregateSnapshot,options:{years:readonly string[];existing?:AggregateRecord;saved?:boolean;stored?:boolean;automatic?:boolean}):string{
  const m=aggregateMetrics(snapshot),stored=options.stored??false
  const comparison=snapshot.events.toReversed().map(event=>{
    const v=event.metrics
    return `<tr><td><a href="${stored?h(event.sourceIssueUrl):'/records/'+encodeURIComponent(event.slug)}">${h(event.title)}</a><small>${event.date}</small></td><td><strong>${percent(v.completionRate)}</strong><div class="mini-progress"><i style="width:${v.completionRate??0}%"></i></div><small>${v.completed}/${v.total}</small></td><td>${percent(v.onTimeRate)}<small>日時 ${v.known}/${v.completed}</small></td><td>${v.averageDelayDays??'—'}<small>日</small></td><td>${v.reopenEvents}</td></tr>`
  }).join('')
  const plots=snapshot.events.slice(-12).map(event=>`<div class="event-plot" title="${h(event.title)}：期日内完了率 ${percent(event.metrics.onTimeRate)}"><span>${percent(event.metrics.onTimeRate)}</span><div class="event-plot-track"><i style="height:${event.metrics.onTimeRate??0}%"></i></div><small>${event.date.slice(5).replace('-','/')}</small></div>`).join('')
  const title=stored?'保存した横断集計':'運営メトリクス'
  const tools=`<div class="metrics-toolbar">${!stored?`<form class="period-filter" method="get" action="/records" data-period-filter><label class="period-control">${calendarIcon}<select name="year" aria-label="集計年">${['all',...options.years].map(year=>`<option value="${year}"${snapshot.year===year?' selected':''}>${year==='all'?'全期間':year+'年'}</option>`).join('')}</select>${chevronIcon}</label><noscript><button class="secondary-button" type="submit">適用</button></noscript></form>`:`<span class="subtle">${snapshot.year==='all'?'全期間':snapshot.year+'年'}</span>`}${exportControls(stored?'/records/saved/export':'/records/export',stored?undefined:snapshot.year)}</div>`
  return `<main class="metrics-page">${pageHeader(title, `${date(snapshot.capturedAt,snapshot.timeZone)} 時点 · ${snapshot.timeZone}${stored?' · 保存済み':''}`, tools)}${options.saved?'<p class="notice" role="status">Insights Issueを保存しました</p>':''}${metricsView(m,snapshot.events.length)}
    <div class="result-visuals">${breakdown(m)}<section class="insight-card"><header class="panel-heading"><h2>イベントごとの期日内完了率</h2><span class="subtle">直近12件</span></header>${plots?`<div class="event-plots" role="img" aria-label="${h(snapshot.events.slice(-12).map(event=>event.title+' '+percent(event.metrics.onTimeRate)).join('、'))}">${plots}</div>`:'<p class="quiet-empty">Closedイベントなし</p>'}</section></div>
    <section class="comparison-panel"><header class="panel-heading"><h2>イベント比較 <span>${snapshot.events.length}</span></h2></header>${snapshot.events.length?`<div class="table-scroll"><table class="metrics-comparison"><thead><tr><th>イベント</th><th>完了</th><th>期日内</th><th>平均超過</th><th>再開</th></tr></thead><tbody>${comparison}</tbody></table></div>`:'<p class="quiet-empty">Closeされたイベントがここに表示されます</p>'}</section>
    <div class="aggregate-storage">${options.existing?`<a href="${h(options.existing.issueUrl)}">Insights Issue ↗</a>`:''}<span>自動同期</span></div>${method}${!stored?periodScript:''}</main>`
}

export function individualView(snapshot:RecordSnapshot,archive=true):string{
  const m=recordMetrics(snapshot),base=archive?'/records/'+encodeURIComponent(snapshot.slug):'/events/'+encodeURIComponent(snapshot.slug)+'/results'
  const completed=snapshot.tasks.filter(task=>task.done&&task.completedAt).toSorted((a,b)=>Date.parse(b.completedAt!)-Date.parse(a.completedAt!))
  const tasks=snapshot.tasks.toSorted((a,b)=>Number(a.done)-Number(b.done)||(a.done
    ? (b.completedAt?Date.parse(b.completedAt):Number.NEGATIVE_INFINITY)-(a.completedAt?Date.parse(a.completedAt):Number.NEGATIVE_INFINITY)||a.due.localeCompare(b.due)
    : a.due.localeCompare(b.due)))
  const rows=tasks.map(task=>`<tr><td>${h(task.title)}</td><td><span class="task-state ${task.done?'is-done':'is-open'}">${task.done?'完了':'未完了'}</span></td><td>${task.due}</td><td>${task.done?task.completedAt?date(task.completedAt,snapshot.timeZone):'<span class="missing-date">未記録</span>':'—'}</td><td>${delayDays(task,snapshot)===null?'—':delayDays(task,snapshot)+'日'}</td></tr>`).join('')
  return `<main class="record-page">${pageHeader(snapshot.title, `${snapshot.date} 開催 · ${date(snapshot.capturedAt,snapshot.timeZone)} 時点`, `<span class="record-state">${archive?'✓ Closed':'○ 進行中'}</span>${exportControls(base+'/export')}`)}<div class="record-breadcrumb"><a href="/records">← 運営メトリクス</a></div><article class="record-document">${metricsView(m)}<div class="result-visuals">${breakdown(m)}<section class="insight-card"><header class="panel-heading"><h2>直近の完了</h2><span class="subtle">${m.known}/${m.completed} 日時あり</span></header><ol class="completion-log">${completed.slice(0,5).map(task=>`<li><span>${h(task.title)}</span><time>${date(task.completedAt!,snapshot.timeZone).slice(5).replace('-','/')}</time></li>`).join('')||'<li class="quiet-empty">記録なし</li>'}</ol></section></div><section class="comparison-panel"><header class="panel-heading"><h2>タスク <span>${snapshot.tasks.length}</span></h2></header><div class="table-scroll"><table class="metrics-comparison individual-tasks"><thead><tr><th>タスク</th><th>状態</th><th>期日</th><th>完了日</th><th>超過日数</th></tr></thead><tbody>${rows}</tbody></table></div></section><footer class="record-document-footer"><a href="${h(snapshot.sourceIssueUrl)}">Event Hub Issue ↗</a><a href="/events/${encodeURIComponent(snapshot.slug)}">イベント →</a></footer>${method}</article></main>`
}
