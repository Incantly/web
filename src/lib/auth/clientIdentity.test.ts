import { afterEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { createClientIdentity } from '../../../server/client-identity.mjs'
import { canonicalIp, hasValidStamp, stampClientIdentity } from './clientIdentity'
import { middleware as proxy } from '../../middleware'

const secret = 'test-proxy-secret-at-least-32-characters'
const forged = {
  'x-incantly-client-ip': '192.0.2.9',
  'x-incantly-client-time': '1700000000000',
  'x-incantly-client-signature': 'f'.repeat(64),
  'x-incantly-verified-client-ip': '192.0.2.9',
  'x-forwarded-for': '192.0.2.9',
}

// Stamp through server/client-identity.mjs exactly as server.mjs does.
function nodeStamp(address: string, now: number) {
  vi.spyOn(Date, 'now').mockReturnValue(now)
  const request = { socket: { remoteAddress: address }, headers: { ...forged } as Record<string, string> }
  createClientIdentity(secret)(request)
  vi.restoreAllMocks()
  return request.headers
}

const addresses = [
  '203.0.113.7', '0.0.0.0', '255.255.255.255',
  '2001:db8::1', '2001:DB8:0:0:0:0:0:1', '2001:0db8:0000:0000:0001:0000:0000:0001', '::1', '::', '1::', 'fe80::',
  '2001:db8:0:1:1:1:1:1', '0:0:1:0:0:1:0:0', '1:0:0:2:0:0:0:3',
  '::ffff:203.0.113.7', '::FFFF:cb00:7107', '0:0:0:0:0:ffff:7f00:2', '::ffff:0:0', '::1.2.3.4', '::0.0.1.2', '64:ff9b::192.0.2.33',
]

function randomIpv6() {
  return Array.from({ length: 8 }, () => {
    const roll = Math.random()
    return roll < 0.4 ? '0' : roll < 0.5 ? 'ffff' : Math.floor(Math.random() * 0x10000).toString(16)
  }).join(':')
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('Web Crypto client identity matches server/client-identity.mjs', () => {
  it.each(addresses)('signs %s byte-identically', async (address) => {
    const now = 1761400000123
    const expected = nodeStamp(address, now)
    const headers = await stampClientIdentity(new Headers(forged), address, secret, now)
    expect(headers).not.toBeNull()
    for (const name of ['x-incantly-client-ip', 'x-incantly-client-time', 'x-incantly-client-signature', 'x-forwarded-for']) {
      expect(headers!.get(name)).toBe(expected[name])
    }
    expect(headers!.has('x-incantly-verified-client-ip')).toBe(false)
  })

  it('canonicalizes random IPv6 addresses like Node', () => {
    for (let i = 0; i < 2000; i++) {
      const address = randomIpv6()
      expect(canonicalIp(address), address).toBe(nodeStamp(address, 1761400000123)['x-incantly-client-ip'])
    }
  })

  it('rejects anything Node rejects', () => {
    for (const bad of ['', 'garbage', '1.2.3', '01.2.3.4', '256.1.1.1', '1.2.3.4.5', '1::2::3', ':1::2', '1:2:3:4:5:6:7:8:9', '12345::', '::ffff:1.2.3', '1.2.3.4:80']) {
      expect(canonicalIp(bad), bad).toBeNull()
      expect(() => nodeStamp(bad, 1)).toThrow()
    }
  })

  it('accepts a server.mjs stamp and rejects forged, stale or missing ones', async () => {
    const now = Date.now()
    const stamped = new Headers(nodeStamp('198.51.100.4', now))
    expect(await hasValidStamp(stamped, secret, now + 1000)).toBe(true)
    expect(await hasValidStamp(stamped, secret, now + 31_000)).toBe(false)
    expect(await hasValidStamp(stamped, 'another-secret-that-is-32-characters-long', now)).toBe(false)
    expect(await hasValidStamp(new Headers({ ...forged, 'x-incantly-client-time': String(now) }), secret, now)).toBe(false)
    expect(await hasValidStamp(new Headers(), secret, now)).toBe(false)
  })
})

describe('proxy on Cloudflare Workers', () => {
  function onWorkers(headers: Record<string, string>, path = '/api/auth/get-session') {
    vi.stubGlobal('navigator', { userAgent: 'Cloudflare-Workers' })
    vi.stubEnv('AUTH_PROXY_SECRET', secret)
    return proxy(new NextRequest(`https://incantly.xyz${path}`, { headers }))
  }
  const forwarded = (response: Response, name: string) => response.headers.get(`x-middleware-request-${name}`)

  it.each(['/api/auth/get-session', '/v1/notes'])('replaces forged stamps on %s with one for CF-Connecting-IP', async (path) => {
    const response = await onWorkers({ ...forged, 'cf-connecting-ip': '::ffff:203.0.113.7' }, path)
    expect(response.headers.get('x-middleware-next')).toBe('1')
    const time = forwarded(response, 'x-incantly-client-time')!
    expect(time).toMatch(/^\d{13}$/)
    const expected = nodeStamp('203.0.113.7', Number(time))
    expect(forwarded(response, 'x-incantly-client-ip')).toBe('203.0.113.7')
    expect(forwarded(response, 'x-incantly-client-signature')).toBe(expected['x-incantly-client-signature'])
    expect(forwarded(response, 'x-forwarded-for')).toBe('203.0.113.7')
    expect(forwarded(response, 'x-incantly-verified-client-ip')).toBeNull()
    expect(response.headers.get('x-middleware-override-headers')).not.toContain('x-incantly-verified-client-ip')
  })

  it.each<Record<string, string>>([{}, { 'cf-connecting-ip': 'garbage' }, { 'cf-connecting-ip': '203.0.113.7, 198.51.100.1' }])('refuses %o with 403', async (headers) => {
    const response = await onWorkers({ ...forged, ...headers })
    expect(response.status).toBe(403)
    expect(response.headers.get('x-middleware-next')).toBeNull()
  })

  it('fails closed without a 32-character secret', async () => {
    vi.stubGlobal('navigator', { userAgent: 'Cloudflare-Workers' })
    vi.stubEnv('AUTH_PROXY_SECRET', 'short')
    const response = await proxy(new NextRequest('https://incantly.xyz/v1/notes', { headers: { 'cf-connecting-ip': '203.0.113.7' } }))
    expect(response.status).toBe(503)
  })
})

describe('proxy under Node (server.mjs)', () => {
  it('passes a valid server.mjs stamp through untouched and refuses forged ones', async () => {
    vi.stubEnv('AUTH_PROXY_SECRET', secret)
    const stamped = nodeStamp('198.51.100.4', Date.now())
    const ok = await proxy(new NextRequest('http://localhost:3000/api/auth/get-session', { headers: stamped }))
    expect(ok.headers.get('x-middleware-next')).toBe('1')
    expect(ok.headers.get('x-middleware-override-headers')).toBeNull()
    const bad = await proxy(new NextRequest('http://localhost:3000/v1/notes', { headers: { ...forged, 'x-incantly-client-time': String(Date.now()) } }))
    expect(bad.status).toBe(403)
  })
})
