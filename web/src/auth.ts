import { verifyWithJwks } from 'hono/jwt'

export interface AccessEnv {
  readonly CF_ACCESS_TEAM_DOMAIN: string
  readonly CF_ACCESS_AUD: string
  readonly ICHIZA_MEMBERS: string
}

export interface Operator {
  readonly email: string
  readonly github: string
}

interface VerificationOptions {
  readonly jwks_uri: string
  readonly verification: { readonly aud: string; readonly iss: string }
  readonly allowedAlgorithms: readonly ['RS256']
}

type AccessVerifier = (
  token: string,
  options: VerificationOptions,
) => Promise<Record<string, unknown>>

export class AccessError extends Error {
  readonly status: 401 | 403 | 500

  constructor(status: 401 | 403 | 500, message: string) {
    super(message)
    this.name = 'AccessError'
    this.status = status
  }
}

function parseMembers(value: string): readonly Operator[] {
  try {
    const parsed: unknown = JSON.parse(value)
    if (!Array.isArray(parsed)) throw new Error('members must be an array')
    return parsed.map((member) => {
      if (
        typeof member !== 'object' ||
        member === null ||
        typeof (member as Record<string, unknown>).email !== 'string' ||
        typeof (member as Record<string, unknown>).github !== 'string'
      ) {
        throw new Error('invalid member')
      }
      const record = member as Record<'email' | 'github', string>
      return { email: record.email.toLowerCase(), github: record.github }
    })
  } catch {
    throw new AccessError(500, 'ICHIZA_MEMBERS is invalid')
  }
}

const defaultVerifier: AccessVerifier = async (token, options) =>
  verifyWithJwks(token, options) as Promise<Record<string, unknown>>

export async function authenticateAccess(
  request: Request,
  env: AccessEnv,
  verify: AccessVerifier = defaultVerifier,
): Promise<Operator> {
  const teamDomain = env.CF_ACCESS_TEAM_DOMAIN.toLowerCase()
  if (!/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(teamDomain) || env.CF_ACCESS_AUD === '') {
    throw new AccessError(500, 'Cloudflare Access configuration is missing')
  }
  const token = request.headers.get('Cf-Access-Jwt-Assertion')
  if (token === null || token === '') throw new AccessError(401, 'Cloudflare Access token is required')
  const issuer = `https://${teamDomain}`
  let payload: Record<string, unknown>
  try {
    payload = await verify(token, {
      jwks_uri: `${issuer}/cdn-cgi/access/certs`,
      verification: { aud: env.CF_ACCESS_AUD, iss: issuer },
      allowedAlgorithms: ['RS256'],
    })
  } catch {
    throw new AccessError(401, 'invalid Cloudflare Access token')
  }
  if (typeof payload.email !== 'string') throw new AccessError(401, 'Access token has no email')
  const email = payload.email.toLowerCase()
  const member = parseMembers(env.ICHIZA_MEMBERS).find((candidate) => candidate.email === email)
  if (member === undefined) throw new AccessError(403, 'operator is not allowed')
  return member
}
