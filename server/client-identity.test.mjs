import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { createClientIdentity } from './client-identity.mjs'

const secret = 'test-proxy-secret-at-least-32-characters'
function req(address, headers = {}) { return { socket: { remoteAddress: address }, headers } }
test('untrusted sockets cannot choose identity through any header', () => {
  const stamp = createClientIdentity(secret)
  const request = req('::ffff:127.0.0.2', {
    'x-forwarded-for': '192.0.2.9', 'cf-connecting-ip': '192.0.2.9',
    'x-incantly-client-ip': '192.0.2.9', 'x-incantly-client-signature': 'forged',
    'x-incantly-verified-client-ip': '192.0.2.9',
  })
  stamp(request)
  assert.equal(request.headers['x-incantly-client-ip'], '127.0.0.2')
  assert.equal(request.headers['x-forwarded-for'], '127.0.0.2')
  assert.equal(request.headers['x-incantly-verified-client-ip'], undefined)
  const expected = createHmac('sha256', secret).update(`incantly-auth-client-v1\n127.0.0.2\n${request.headers['x-incantly-client-time']}`).digest('hex')
  assert.equal(request.headers['x-incantly-client-signature'], expected)
})
test('trusted chains stop at the nearest untrusted address, not spoofed leftmost', () => {
  const stamp = createClientIdentity(secret, '10.0.0.0/24')
  const request = req('10.0.0.2', { 'x-forwarded-for': '192.0.2.99, 198.51.100.1, 10.0.0.3' })
  stamp(request)
  assert.equal(request.headers['x-incantly-client-ip'], '198.51.100.1')
  assert.throws(() => stamp(req('10.0.0.2')))
  assert.throws(() => stamp(req('10.0.0.2', { 'x-forwarded-for': 'garbage' })))
})
test('invalid configuration fails closed and address forms are canonicalized', () => {
  assert.throws(() => createClientIdentity('short'))
  assert.throws(() => createClientIdentity(secret, 'true'))
  assert.throws(() => createClientIdentity(secret, '10.0.0.1/33'))
  const stamp = createClientIdentity(secret)
  const a = req('::ffff:7f00:2'), b = req('127.0.0.2')
  stamp(a); stamp(b)
  assert.equal(a.headers['x-incantly-client-ip'], b.headers['x-incantly-client-ip'])
})
