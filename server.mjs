import { createServer } from 'node:http'
import next from 'next'
import nextEnv from '@next/env'
import { createClientIdentity } from './server/client-identity.mjs'

const dev = process.env.NODE_ENV !== 'production'
nextEnv.loadEnvConfig(process.cwd(), dev)
const stamp = createClientIdentity(process.env.AUTH_PROXY_SECRET, process.env.AUTH_TRUSTED_PROXY_CIDRS)
const port = Number(process.env.PORT || 3000)
const app = next({ dev, port })
await app.prepare()
const handle = app.getRequestHandler()
const server = createServer((request, response) => {
  try { stamp(request) }
  catch { response.writeHead(403).end('Untrusted client identity'); return }
  Promise.resolve(handle(request, response)).catch(() => {
    if (!response.headersSent) response.writeHead(503)
    response.end()
  })
})
server.on('upgrade', (request, socket, head) => {
  try { stamp(request) }
  catch { socket.destroy(); return }
  app.getUpgradeHandler()(request, socket, head)
})
server.listen(port, process.env.BIND_ADDRESS || '127.0.0.1')
