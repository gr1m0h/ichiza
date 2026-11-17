import { describe, expect, it } from 'vitest'
import type { EventDashboard } from './dashboard'
import { createSnapshot, createAggregate, aggregateMetrics, delayDays, parseAggregate, renderAggregate, recordMetrics, recordsCsv, renderRecord, validateSnapshot, validateAggregate } from './records'

const dashboard: EventDashboard = {issueNumber:42,issueUrl:'https://github.example/issues/42',updatedAt:'2026-11-12T00:00:00Z',slug:'event-1',title:'SRE Lounge',date:'2026-11-13',
  body:'<!-- ichiza-tasks:start -->\n<!-- ichiza-deleted-task:removed -->\n<!-- ichiza-tasks:end -->\n<!-- ichiza-deleted-task:notes-only -->',
  tasks:[
    {id:'on-time',title:'会場確保',due:'2026-11-10',done:true,assignees:['alice'],labels:[],completed_at:'2026-11-10T14:00:00Z'},
    {id:'late',title:'告知',due:'2026-11-10',done:true,assignees:[],labels:[],completed_at:'2026-11-10T15:00:00Z',history:[{at:'2026-11-09T00:00:00Z',done:true},{at:'2026-11-10T00:00:00Z',done:false},{at:'2026-11-10T15:00:00Z',done:true}]},
    {id:'unknown',title:'過去の完了',due:'2026-11-10',done:true,assignees:[],labels:[]},
    {id:'open',title:'未完了',due:'2026-11-11',done:false,assignees:[],labels:[]},
    {id:'future',title:'今後',due:'2026-11-20',done:false,assignees:[],labels:[]},
  ]}
const snapshot = createSnapshot(dashboard,'Asia/Tokyo','2026-11-13T01:00:00Z')

describe('event result records', () => {
  it('distinguishes deadline rates, unknown completion times, open work and recorded reopens', () => {
    expect(recordMetrics(snapshot)).toEqual({total:5,completed:3,open:2,overdue:1,onTime:1,late:1,unknown:1,known:2,
      completionRate:60,onTimeRate:50,lateDays:1,averageDelayDays:1,maxDelayDays:1,reopened:1,reopenEvents:1,removed:1})
    expect(snapshot.removedTaskIds).toEqual(['removed'])
    expect(delayDays(snapshot.tasks[2]!,snapshot)).toBeNull()
    expect(delayDays(snapshot.tasks[3]!,snapshot)).toBe(2)
  })

  it('keeps missing data distinct from zero and calculates empty and on-time populations', () => {
    const empty={...snapshot,tasks:[],removedTaskIds:[]}
    expect(recordMetrics(empty)).toMatchObject({total:0,completionRate:null,onTimeRate:null,averageDelayDays:null,maxDelayDays:null})
    expect(recordMetrics({...snapshot,tasks:[snapshot.tasks[0]!]})).toMatchObject({completionRate:100,onTimeRate:100,averageDelayDays:0,maxDelayDays:0})
    expect(recordMetrics({...snapshot,tasks:[snapshot.tasks[2]!]})).toMatchObject({completed:1,unknown:1,onTimeRate:null,averageDelayDays:null})
  })

  it('aggregates only Closed events and weights task rates and late-day averages by their actual populations', () => {
    const closed={...dashboard,state:'closed' as const,closedAt:'2026-11-13T01:00:00Z'}
    const second={...closed,slug:'event-2',issueNumber:43,closedAt:'2026-11-20T00:00:00Z',tasks:Array.from({length:3},(_,i)=>({...dashboard.tasks[0]!,id:'b-'+i,completed_at:'2026-11-18T00:00:00Z'}))}
    const aggregate=createAggregate([closed,second,{...closed,state:'open'}],'Asia/Tokyo','2026-11-25T01:00:00Z')
    expect(aggregate.events).toHaveLength(2)
    expect(aggregateMetrics(aggregate)).toMatchObject({total:8,completed:6,completionRate:75,known:5,onTime:1,onTimeRate:20,late:4,lateDays:25,averageDelayDays:6.3,maxDelayDays:8})
    expect(validateAggregate(aggregate)).toEqual(aggregate)
    expect(createAggregate([closed],'Asia/Tokyo','2026-11-25T01:00:00Z','2025').events).toEqual([])
    expect(()=>createAggregate([closed],'Asia/Tokyo','2026-11-25T01:00:00Z','bad')).toThrow('invalid metrics year')
  })

  it('round trips a compact aggregate snapshot independently of subsequent source changes', () => {
    const aggregate=createAggregate([{...dashboard,state:'closed',closedAt:'2026-11-13T01:00:00Z'}],'Asia/Tokyo','2026-11-13T02:00:00Z')
    const body=renderAggregate(aggregate)
    const parsed=parseAggregate(body,99,'https://github.example/issues/99','2026-11-13T02:00:00Z')
    expect(parsed.snapshot).toEqual(aggregate)
    expect(parsed.snapshot.events[0]).not.toHaveProperty('tasks')
    expect(aggregateMetrics(parsed.snapshot).total).toBe(5)
    expect(createAggregate([],'Asia/Tokyo','2026-11-14T01:00:00Z').events).toEqual([])
    expect(parseAggregate(body.replaceAll('\n','\r\n'),99,'','').snapshot).toEqual(aggregate)
    expect(body).not.toContain('よかったこと')
    expect(body).not.toContain('改善したいこと')
    expect(body).not.toContain('次回やること')
  })

  it('serializes aggregate comments safely and escapes individual export titles without adding narrative fields', () => {
    const evil={...dashboard,title:'<script>alert(1)</script> --> @alice\u2028line\u2029next',state:'closed' as const,closedAt:'2026-11-13T01:00:00Z'}
    const aggregate=createAggregate([evil],'Asia/Tokyo','2026-11-13T02:00:00Z')
    const body=renderAggregate(aggregate)
    expect(body).toContain('\\u003cscript')
    expect(parseAggregate(body,1,'','').snapshot.events[0]?.title).toBe(evil.title)
    expect(renderRecord({...snapshot,tasks:[{...snapshot.tasks[0]!,title:'a | b\n@alice <img>'}]})).toContain('a \\| b &#64;alice &lt;img&gt;')
    expect(renderRecord(snapshot)).not.toContain('振り返り')
  })

  it.each([
    {version:2}, {date:'2026-02-30'}, {sourceIssueUrl:'javascript:alert(1)'}, {timeZone:'invalid/zone'},
    {tasks:[{...snapshot.tasks[0]!,history:[{at:'invalid',done:true}]}]},
    {tasks:[snapshot.tasks[0]!,snapshot.tasks[0]!]}, {removedTaskIds:['on-time']},
    {tasks:[{...snapshot.tasks[0]!,done:'true'}]},
  ])('rejects invalid imported snapshots: %j', fields => {
    expect(() => validateSnapshot({...snapshot,...fields})).toThrow()
  })

  it('rejects malformed, duplicate and internally inconsistent aggregate snapshots', () => {
    const aggregate=createAggregate([{...dashboard,state:'closed',closedAt:'2026-11-13T01:00:00Z'}],'Asia/Tokyo','2026-11-13T02:00:00Z')
    const body=renderAggregate(aggregate)
    expect(()=>parseAggregate('ordinary issue',1,'','')).toThrow('invalid aggregate markers')
    expect(()=>validateAggregate({...aggregate,events:[aggregate.events[0],aggregate.events[0]]})).toThrow('duplicate aggregate event')
    expect(()=>validateAggregate({...aggregate,events:[{...aggregate.events[0],metrics:{...aggregate.events[0]!.metrics,total:100}}]})).toThrow('inconsistent aggregate metrics')
    expect(()=>validateAggregate({...aggregate,year:'bad'})).toThrow('invalid aggregate snapshot')
    expect(()=>parseAggregate(body.replace('ichiza-metrics-data:', 'missing:'),1,'','')).toThrow('invalid aggregate markers')
  })

  it('exports comparable CSV rows with proper quotes, BOM, formula protection and blank unknown metrics', () => {
    const csv=recordsCsv([{...snapshot,title:'=SUM(1,2)'},{...snapshot,title:'A "quoted" title',tasks:[]}])
    expect(csv.startsWith('\ufeff"event","event_date"')).toBe(true)
    expect(csv).toContain('"\'=SUM(1,2)"')
    expect(csv).toContain('"A ""quoted"" title"')
    expect(csv.split('\r\n')).toHaveLength(4)
    expect(recordsCsv([]).split('\r\n')).toHaveLength(2)
  })
})
