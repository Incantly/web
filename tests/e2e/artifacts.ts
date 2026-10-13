import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { Page } from '@playwright/test'

const ROOT = join(__dirname, '..', '..', 'e2e-artifacts')
const RESULTS = join(ROOT, 'results.json')

export interface Check {
  suite: string
  name: string
  pass: boolean
  detail?: string
}

const checks: Check[] = []

try {
  const previous = JSON.parse(readFileSync(RESULTS, 'utf8')) as { results?: Check[] }
  if (Array.isArray(previous.results)) checks.push(...previous.results)
} catch {
  // First run: no previous artifact yet.
}

/** Record a check and persist the artifact file immediately. */
export function check(suite: string, name: string, pass: boolean, detail = ''): void {
  checks.push({ suite, name, pass, detail })
  mkdirSync(ROOT, { recursive: true })
  writeFileSync(RESULTS, JSON.stringify({ when: new Date().toISOString(), results: checks }, null, 2))
}

/** Screenshot into the shared artifact directory. Returns the file path. */
export async function shot(page: Page, name: string): Promise<string> {
  const file = join(ROOT, 'screenshots', `${name}.png`)
  mkdirSync(dirname(file), { recursive: true })
  await page.screenshot({ path: file })
  return file
}

/**
 * Press a bubble-toolbar button the way the product handles it: our toolbar
 * acts on mousedown (so the editor selection survives), and a successful
 * command collapses the selection which unmounts the bubble mid-click.
 * A full Playwright click then hangs waiting for a detached node.
 */
export async function pressToolbarButton(page: Page, name: string | RegExp): Promise<void> {
  const button = page.getByRole('button', { name })
  await button.waitFor({ state: 'visible' })
  await button.dispatchEvent('mousedown', { button: 'left', bubbles: true, cancelable: true })
}

/** Console errors and failed requests observed while `fn` runs. */
export async function captureProblems(page: Page, fn: () => Promise<void>): Promise<string[]> {
  const problems: string[] = []
  const onConsole = (message: { type: () => string; text: () => string }) => {
    if (message.type() === 'error') problems.push(`console: ${message.text()}`)
  }
  const onResponse = (response: { status: () => number; url: () => string }) => {
    if (response.status() >= 400) problems.push(`http-${response.status()}: ${response.url()}`)
  }
  const onPageError = (error: Error) => problems.push(`pageerror: ${error.message}`)
  page.on('console', onConsole)
  page.on('response', onResponse)
  page.on('pageerror', onPageError)
  try {
    await fn()
  } finally {
    page.off('console', onConsole)
    page.off('response', onResponse)
    page.off('pageerror', onPageError)
  }
  return problems.filter((problem) => !problem.includes('favicon.ico'))
}

export function artifactPaths(): { root: string; results: string } {
  if (!existsSync(ROOT)) mkdirSync(ROOT, { recursive: true })
  return { root: ROOT, results: RESULTS }
}
