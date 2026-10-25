// Web Crypto port of server/client-identity.mjs for runtimes that never run
// server.mjs (Cloudflare Workers). Signatures must stay byte-identical to the
// Node stamp: the backend verifies both with the same AUTH_PROXY_SECRET.

const CONTEXT = 'incantly-auth-client-v1'
const MAX_SKEW_MS = 30_000

export const IDENTITY_HEADERS = [
  'x-incantly-client-ip',
  'x-incantly-client-time',
  'x-incantly-client-signature',
  'x-incantly-verified-client-ip',
] as const

const IPV4 = /^(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]\d|\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]\d|\d)$/

function parseIpv6(address: string): number[] | null {
  if (address.length > 45 || !/^[0-9a-fA-F:.]+$/.test(address)) return null
  let head = address
  const tail: number[] = []
  const lastColon = address.lastIndexOf(':')
  if (address.includes('.')) {
    const v4 = address.slice(lastColon + 1)
    if (!IPV4.test(v4)) return null
    const [a, b, c, d] = v4.split('.').map(Number)
    tail.push((a << 8) | b, (c << 8) | d)
    head = address.slice(0, lastColon + 1)
    // Keep "::" intact; a single trailing colon before the IPv4 part is a separator.
    if (head.endsWith(':') && !head.endsWith('::')) head = head.slice(0, -1)
  }
  const halves = head.split('::')
  if (halves.length > 2) return null
  const groups = (part: string) => (part === '' ? [] : part.split(':'))
  const left = groups(halves[0])
  const right = halves.length === 2 ? groups(halves[1]) : []
  if ([...left, ...right].some((group) => !/^[0-9a-fA-F]{1,4}$/.test(group))) return null
  const explicit = left.length + right.length + tail.length
  if (halves.length === 1 ? explicit !== 8 : explicit > 7) return null
  const zeros = new Array(8 - explicit).fill(0)
  return [...left.map((g) => parseInt(g, 16)), ...zeros, ...right.map((g) => parseInt(g, 16)), ...tail]
}

// Same output as libuv's inet_ntop (what Node's SocketAddress uses): RFC 5952
// compression, with IPv4-compatible and IPv4-mapped tails printed dotted.
function formatIpv6(words: number[]): string {
  let best = { base: -1, len: 0 }
  let cur = { base: -1, len: 0 }
  for (let i = 0; i < 8; i++) {
    if (words[i] === 0) {
      cur = cur.base === -1 ? { base: i, len: 1 } : { base: cur.base, len: cur.len + 1 }
    } else if (cur.base !== -1) {
      if (best.base === -1 || cur.len > best.len) best = cur
      cur = { base: -1, len: 0 }
    }
  }
  if (cur.base !== -1 && (best.base === -1 || cur.len > best.len)) best = cur
  if (best.base !== -1 && best.len < 2) best = { base: -1, len: 0 }
  let out = ''
  for (let i = 0; i < 8; i++) {
    if (best.base !== -1 && i >= best.base && i < best.base + best.len) {
      if (i === best.base) out += ':'
      continue
    }
    if (i !== 0) out += ':'
    if (i === 6 && best.base === 0 && (best.len === 6 || (best.len === 5 && words[5] === 0xffff))) {
      return out + [words[6] >> 8, words[6] & 0xff, words[7] >> 8, words[7] & 0xff].join('.')
    }
    out += words[i].toString(16)
  }
  if (best.base !== -1 && best.base + best.len === 8) out += ':'
  return out
}

/** Mirrors canonical() in server/client-identity.mjs; returns null for anything that is not an IP. */
export function canonicalIp(address: string | null | undefined): string | null {
  if (!address) return null
  if (IPV4.test(address)) return address
  const words = parseIpv6(address)
  if (!words) return null
  const normalized = formatIpv6(words)
  return normalized.startsWith('::ffff:') && IPV4.test(normalized.slice(7)) ? normalized.slice(7) : normalized
}

const keys = new Map<string, Promise<CryptoKey>>()
function hmacKey(secret: string) {
  let key = keys.get(secret)
  if (!key) {
    key = crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    keys.set(secret, key)
  }
  return key
}

export function validSecret(secret: string | undefined): secret is string {
  return typeof secret === 'string' && secret.length >= 32
}

export async function signClientIdentity(secret: string, ip: string, time: string): Promise<string> {
  const mac = await crypto.subtle.sign('HMAC', await hmacKey(secret), new TextEncoder().encode(`${CONTEXT}\n${ip}\n${time}`))
  return Array.from(new Uint8Array(mac), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

/**
 * Returns a copy of `incoming` with every client-sent identity header removed
 * and a fresh stamp for `clientIp`, or null when the address is not an IP.
 */
export async function stampClientIdentity(incoming: Headers, clientIp: string | null, secret: string, now = Date.now()): Promise<Headers | null> {
  const headers = new Headers(incoming)
  for (const name of IDENTITY_HEADERS) headers.delete(name)
  const ip = canonicalIp(clientIp)
  if (!ip) return null
  const time = String(now)
  headers.set('x-incantly-client-ip', ip)
  headers.set('x-incantly-client-time', time)
  headers.set('x-incantly-client-signature', await signClientIdentity(secret, ip, time))
  headers.set('x-forwarded-for', ip)
  return headers
}

/** True when `headers` carry a fresh, correctly signed stamp (as made by server.mjs). */
export async function hasValidStamp(headers: Headers, secret: string, now = Date.now()): Promise<boolean> {
  const ip = headers.get('x-incantly-client-ip')
  const time = headers.get('x-incantly-client-time') ?? ''
  const signature = headers.get('x-incantly-client-signature') ?? ''
  if (!ip || canonicalIp(ip) !== ip || !/^\d{13}$/.test(time) || !/^[0-9a-f]{64}$/.test(signature)) return false
  if (Math.abs(now - Number(time)) > MAX_SKEW_MS) return false
  const expected = await signClientIdentity(secret, ip, time)
  let diff = 0
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i)
  return diff === 0
}
