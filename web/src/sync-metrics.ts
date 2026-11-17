import { GitHubClient } from './github'

export async function syncMetrics(env:Record<string,string|undefined>):Promise<void>{
  const repository=env.ICHIZA_REPOSITORY||env.GH_REPO||env.GITHUB_REPOSITORY
  const token=env.ICHIZA_GITHUB_TOKEN||env.GH_TOKEN||env.GITHUB_TOKEN
  if(!repository||!token)throw new Error('repository and Issues write token are required')
  const zone=env.ICHIZA_TIMEZONE||undefined
  if(zone)new Intl.DateTimeFormat('en-US',{timeZone:zone}).format()
  const record=await new GitHubClient({repository,token}).syncAggregate(zone)
  console.log(`ichiza metrics: Issue #${record.issueNumber}, ${record.snapshot.events.length} Closed events`)
}
