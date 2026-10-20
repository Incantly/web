// Downloads the backend OpenAPI schema into src/lib/api/openapi.json.
// Credentials come only from the environment; never commit them or pass them in a URL.
//   API_DOCS_USERNAME=… API_DOCS_PASSWORD=… npm run api:fetch && npm run api:types
import { writeFile } from 'node:fs/promises'

const base = process.env.API_DOCS_URL ?? 'http://localhost:3002'
const { API_DOCS_USERNAME: user, API_DOCS_PASSWORD: password } = process.env
if (!user || !password) {
  console.error('Set API_DOCS_USERNAME and API_DOCS_PASSWORD (from the backend .env).')
  process.exit(1)
}

const response = await fetch(`${base}/v1/docs/openapi.json`, {
  headers: { authorization: `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}` },
})
if (!response.ok) {
  console.error(`Schema download failed: HTTP ${response.status}`)
  process.exit(1)
}
const schema = await response.json()
await writeFile(new URL('../src/lib/api/openapi.json', import.meta.url), `${JSON.stringify(schema, null, 2)}\n`)
console.log(`Saved ${Object.keys(schema.paths ?? {}).length} paths to src/lib/api/openapi.json`)
