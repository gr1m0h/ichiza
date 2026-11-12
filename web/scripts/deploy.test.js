import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const action = readFileSync(new URL('../../actions/web-deploy/action.yaml', import.meta.url), 'utf8')
const script = action.split('    - name: Deploy Worker\n      run: |\n')[1]
  .split('      shell: bash')[0].split('\n').map(line => line.slice(8)).join('\n')
const workspaces = []
afterEach(() => workspaces.splice(0).forEach(path => rmSync(path, { recursive: true, force: true })))

function deploy(overrides = {}) {
  const cwd = mkdtempSync(join(tmpdir(), 'ichiza-deploy-test-'))
  workspaces.push(cwd)
  mkdirSync(join(cwd, 'bin'))
  writeFileSync(join(cwd, 'wrangler.jsonc'), readFileSync(new URL('../wrangler.jsonc', import.meta.url)))
  // Capture the arguments and files that the actual Action hands to Wrangler.
  writeFileSync(join(cwd, 'bin/npx'), `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
const configPath = args[args.indexOf('--config') + 1];
const secretPath = args[args.indexOf('--secrets-file') + 1];
fs.writeFileSync('capture.json', JSON.stringify({
  args, configPath, secretPath,
  config: JSON.parse(fs.readFileSync(configPath)),
  secret: JSON.parse(fs.readFileSync(secretPath))
}));
process.exit(Number(process.env.DEPLOY_EXIT || 0));
`, { mode: 0o755 })
  const result = spawnSync('bash', ['-e', '-o', 'pipefail', '-c', script], {
    cwd, encoding: 'utf8', env: {
      ...process.env, PATH: join(cwd, 'bin') + ':' + process.env.PATH,
      CLOUDFLARE_API_TOKEN: 'test-cloudflare', CLOUDFLARE_ACCOUNT_ID: 'test-account',
      ICHIZA_GITHUB_TOKEN: 'test-github', INPUT_WORKER_NAME: 'community-worker',
      INPUT_REPOSITORY: '', GITHUB_REPOSITORY: 'community/events',
      INPUT_MEMBERS: '[{"github":"alice","email":"alice@example.test"}]',
      INPUT_TIMEZONE: 'Asia/Tokyo', INPUT_ACCESS_TEAM_DOMAIN: 'team.cloudflareaccess.com',
      INPUT_ACCESS_AUD: 'test-audience', INPUT_ALLOW_CONFIG_UPDATES: 'false',
      ...overrides,
    },
  })
  const capturePath = join(cwd, 'capture.json')
  return { cwd, result, capture: existsSync(capturePath) ? JSON.parse(readFileSync(capturePath)) : undefined }
}

describe('Worker deployment Action', () => {
  it('passes the effective name and auth bindings as configuration and keeps strict by default', () => {
    const { cwd, result, capture } = deploy()
    expect(result.status, result.stderr).toBe(0)
    expect(capture.args).toContain('--strict')
    expect(capture.args).not.toContain('--var')
    expect(capture.config.name).toBe('community-worker')
    expect(capture.config.main).toBe('src/app.ts')
    expect(capture.config.vars).toEqual({
      ICHIZA_REPOSITORY: 'community/events',
      ICHIZA_MEMBERS: '[{"github":"alice","email":"alice@example.test"}]',
      ICHIZA_TIMEZONE: 'Asia/Tokyo', CF_ACCESS_TEAM_DOMAIN: 'team.cloudflareaccess.com',
      CF_ACCESS_AUD: 'test-audience',
    })
    expect(JSON.stringify(capture.config)).not.toContain('test-github')
    expect(capture.secret).toEqual({ ICHIZA_GITHUB_TOKEN: 'test-github' })
    expect(existsSync(join(cwd, capture.configPath))).toBe(false)
    expect(existsSync(capture.secretPath)).toBe(false)
  })

  it('allows intentional config changes only with explicit opt-in and cleans up on deployment failure', () => {
    const { cwd, result, capture } = deploy({
      INPUT_ALLOW_CONFIG_UPDATES: 'true', INPUT_REPOSITORY: 'other/events', DEPLOY_EXIT: '7',
    })
    expect(result.status).toBe(7)
    expect(capture.args).not.toContain('--strict')
    expect(capture.config.vars.ICHIZA_REPOSITORY).toBe('other/events')
    expect(existsSync(join(cwd, capture.configPath))).toBe(false)
    expect(existsSync(capture.secretPath)).toBe(false)
  })

  it.each([
    { INPUT_ALLOW_CONFIG_UPDATES: 'yes' },
    { INPUT_MEMBERS: '{}' },
    { INPUT_TIMEZONE: 'invalid' },
    { ICHIZA_GITHUB_TOKEN: '' },
  ])('rejects invalid inputs before uploading: %j', overrides => {
    const { result, capture } = deploy(overrides)
    expect(result.status).not.toBe(0)
    expect(capture).toBeUndefined()
  })
})
