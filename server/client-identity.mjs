import { createHmac } from 'node:crypto'
import { BlockList, isIP, SocketAddress } from 'node:net'

export function createClientIdentity(secret, trustedCidrs = '') {
  if (!secret || secret.length < 32) throw new Error('AUTH_PROXY_SECRET must contain at least 32 characters')
  const trusted = new BlockList()
  for (const item of trustedCidrs.split(',').map(value => value.trim()).filter(Boolean)) {
    const [address, prefix, extra] = item.split('/')
    const version = isIP(address)
    if (!version || extra !== undefined || (prefix !== undefined && !/^\d+$/.test(prefix))) throw new Error('Invalid AUTH_TRUSTED_PROXY_CIDRS')
    const bits = prefix === undefined ? (version === 4 ? 32 : 128) : Number(prefix)
    trusted.addSubnet(address, bits, version === 4 ? 'ipv4' : 'ipv6')
  }
  function canonical(address) {
    if (!isIP(address)) throw new Error('Invalid client address')
    const normalized = new SocketAddress({ address, port: 0, family: isIP(address) === 4 ? 'ipv4' : 'ipv6' }).address
    // SocketAddress converts mapped hex forms to dotted decimal.
    return normalized.startsWith('::ffff:') && isIP(normalized.slice(7)) === 4 ? normalized.slice(7) : normalized
  }
  return function stamp(request) {
    let ip = canonical(request.socket.remoteAddress)
    if (trusted.check(ip, isIP(ip) === 4 ? 'ipv4' : 'ipv6')) {
      const header = request.headers['x-forwarded-for']
      if (typeof header !== 'string' || header.length > 2048) throw new Error('Trusted proxy must append client identity')
      const chain = header.split(',').map(value => canonical(value.trim()))
      if (!chain.length || chain.length > 32) throw new Error('Invalid forwarding chain')
      for (let index = chain.length - 1; index >= 0; index--) {
        ip = chain[index]
        if (!trusted.check(ip, isIP(ip) === 4 ? 'ipv4' : 'ipv6')) break
      }
    }
    const time = String(Date.now())
    request.headers['x-incantly-client-ip'] = ip
    request.headers['x-incantly-client-time'] = time
    request.headers['x-incantly-client-signature'] = createHmac('sha256', secret).update(`incantly-auth-client-v1\n${ip}\n${time}`).digest('hex')
    delete request.headers['x-incantly-verified-client-ip']
    request.headers['x-forwarded-for'] = ip
  }
}
