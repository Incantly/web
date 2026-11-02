import { normalizePageSetup, type PageSetup } from '@incantly/canvas-core/document'
import { paperSizes } from './pageSetupModel'

export type NoteExportFormat = 'pdf' | 'docx' | 'md' | 'html' | 'txt'

export const exportFormats: { value: NoteExportFormat; label: string; hint: string }[] = [
  { value: 'pdf', label: 'PDF', hint: 'Pages as they print, with headers and footers.' },
  { value: 'docx', label: 'Word', hint: 'Opens in Word, Google Docs and WPS, with page setup, headers and footers.' },
  { value: 'md', label: 'Markdown', hint: 'Plain text with formatting marks. Page setup isn’t kept.' },
  { value: 'html', label: 'Web page', hint: 'One HTML file. Page setup isn’t kept.' },
  { value: 'txt', label: 'Text', hint: 'Words only, no formatting.' },
]

/** One line describing the paper the export uses, e.g. "A4 · Portrait · 1 column". */
export function exportSummary(setup: PageSetup, format: NoteExportFormat): string | null {
  if (format !== 'pdf' && format !== 'docx') return null
  const normalized = normalizePageSetup(setup)
  const paper = paperSizes.find((size) => size.value === normalized.size)?.label ?? 'Custom size'
  const orientation = normalized.orientation === 'landscape' ? 'Landscape' : 'Portrait'
  const start = normalized.startingPageNumber ?? 1
  return [paper, orientation, start === 1 ? null : `Numbering starts at ${start}`].filter(Boolean).join(' · ')
}
