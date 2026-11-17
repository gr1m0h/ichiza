import {afterEach,describe,expect,it,vi} from 'vitest'
import {syncMetrics} from './sync-metrics'

afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks()})
describe('metrics synchronization command',()=>{
  it('validates required configuration before making requests',async()=>{
    const fetch=vi.fn();vi.stubGlobal('fetch',fetch)
    await expect(syncMetrics({})).rejects.toThrow('repository and Issues write token are required')
    await expect(syncMetrics({GH_REPO:'gr1m0h/community',GH_TOKEN:'test-token',ICHIZA_TIMEZONE:'bad/zone'})).rejects.toThrow()
    expect(fetch).not.toHaveBeenCalled()
  })
  it('runs the real client to initialize an empty index before the first Closed event',async()=>{
    const fetch=vi.fn<typeof globalThis.fetch>().mockResolvedValueOnce(Response.json([])).mockResolvedValueOnce(Response.json([]))
      .mockResolvedValueOnce(Response.json({name:'ichiza:metrics'})).mockImplementationOnce(async(_url,init)=>Response.json({number:99,html_url:'https://github.example/issues/99',updated_at:'2026-11-13T00:00:00Z',...JSON.parse(String(init?.body))}))
    vi.stubGlobal('fetch',fetch)
    const log=vi.spyOn(console,'log').mockImplementation(()=>{})
    await syncMetrics({GH_REPO:'gr1m0h/community',GH_TOKEN:'test-token'})
    expect(log).toHaveBeenCalledWith('ichiza metrics: Issue #99, 0 Closed events')
    expect(log.mock.calls.flat().join(' ')).not.toContain('test-token')
    expect(fetch).toHaveBeenCalledTimes(4)
    expect(fetch.mock.calls[3]?.[1]?.method).toBe('POST')
  })
})
