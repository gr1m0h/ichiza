import { describe, expect, it, vi } from 'vitest'

import { AccessError, authenticateAccess, type AccessEnv } from './auth'

const env: AccessEnv = {
  CF_ACCESS_TEAM_DOMAIN: 'example.cloudflareaccess.com',
  CF_ACCESS_AUD: 'audience-id',
  ICHIZA_MEMBERS: JSON.stringify([
    { email: 'alice@example.com', github: 'alice' },
    { email: 'bob@example.com', github: 'bob' },
  ]),
}

describe('authenticateAccess', () => {
  it('verifies the Access token and maps its email to an operator', async () => {
    const verify = vi.fn().mockResolvedValue({ email: 'Alice@Example.com' })
    const request = new Request('https://ichiza.example.com', {
      headers: { 'Cf-Access-Jwt-Assertion': 'signed-token' },
    })

    const member = await authenticateAccess(request, env, verify)

    expect(member).toEqual({ email: 'alice@example.com', github: 'alice' })
    expect(verify).toHaveBeenCalledWith(
      'signed-token',
      expect.objectContaining({
        jwks_uri: 'https://example.cloudflareaccess.com/cdn-cgi/access/certs',
        verification: { aud: 'audience-id', iss: 'https://example.cloudflareaccess.com' },
      }),
    )
  })

  it('fails closed when configuration or a token is missing', async () => {
    const verify = vi.fn()

    await expect(authenticateAccess(new Request('https://ichiza.example.com'), env, verify)).rejects.toMatchObject({
      status: 401,
    })
    await expect(
      authenticateAccess(
        new Request('https://ichiza.example.com', {
          headers: { 'Cf-Access-Jwt-Assertion': 'token' },
        }),
        { ...env, CF_ACCESS_AUD: '' },
        verify,
      ),
    ).rejects.toMatchObject({ status: 500 })

    await expect(
      authenticateAccess(
        new Request('https://ichiza.example.com', {
          headers: { 'Cf-Access-Jwt-Assertion': 'token' },
        }),
        { ...env, CF_ACCESS_TEAM_DOMAIN: 'https://attacker.example.com' },
        verify,
      ),
    ).rejects.toMatchObject({ status: 500 })
  })

  it('rejects invalid tokens and non-members without exposing verifier errors', async () => {
    const request = new Request('https://ichiza.example.com', {
      headers: { 'Cf-Access-Jwt-Assertion': 'token' },
    })

    await expect(authenticateAccess(request, env, vi.fn().mockRejectedValue(new Error('key detail')))).rejects.toEqual(
      new AccessError(401, 'invalid Cloudflare Access token'),
    )
    await expect(
      authenticateAccess(request, env, vi.fn().mockResolvedValue({ email: 'mallory@example.com' })),
    ).rejects.toMatchObject({ status: 403 })

    await expect(authenticateAccess(request, env, vi.fn().mockResolvedValue({}))).rejects.toMatchObject({
      status: 401,
    })
  })

  it('rejects malformed member configuration', async () => {
    const request = new Request('https://ichiza.example.com', {
      headers: { 'Cf-Access-Jwt-Assertion': 'token' },
    })
    const verify = vi.fn().mockResolvedValue({ email: 'alice@example.com' })

    await expect(authenticateAccess(request, { ...env, ICHIZA_MEMBERS: '{}' }, verify)).rejects.toMatchObject({
      status: 500,
    })
    await expect(
      authenticateAccess(request, { ...env, ICHIZA_MEMBERS: '[{"email":42}]' }, verify),
    ).rejects.toMatchObject({ status: 500 })
  })
})
