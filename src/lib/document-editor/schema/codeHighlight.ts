import { createLowlight } from 'lowlight'
import bash from 'highlight.js/lib/languages/bash'
import css from 'highlight.js/lib/languages/css'
import javascript from 'highlight.js/lib/languages/javascript'
import json from 'highlight.js/lib/languages/json'
import markdown from 'highlight.js/lib/languages/markdown'
import python from 'highlight.js/lib/languages/python'
import typescript from 'highlight.js/lib/languages/typescript'
import xml from 'highlight.js/lib/languages/xml'

/** Languages offered by the code-block language picker. `xml` covers HTML. */
export const CODE_BLOCK_LANGUAGES = [
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'python', label: 'Python' },
  { value: 'bash', label: 'Bash' },
  { value: 'json', label: 'JSON' },
  { value: 'xml', label: 'HTML/XML' },
  { value: 'css', label: 'CSS' },
  { value: 'markdown', label: 'Markdown' },
] as const

export type CodeBlockLanguage = (typeof CODE_BLOCK_LANGUAGES)[number]['value']

function createIncantlyLowlight() {
  const lowlight = createLowlight()
  lowlight.register({ javascript, typescript, python, bash, json, xml, css, markdown })
  lowlight.registerAlias({ html: ['xml'] })
  return lowlight
}

/** Shared highlighter for CodeBlockLowlight. Registered once; the extension decorates. */
export const incantlyLowlight = createIncantlyLowlight()
