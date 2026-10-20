import type { IncantlyDocument } from '@incantly/core/document'
import type { IconName } from '../AppIcon'
import type { Schema } from '../../../lib/api/types'

export type WorkspaceView =
  | 'home'
  | 'search'
  | 'notes'
  | 'spaces'
  | 'library'
  | 'settings'
  | `space:${string}`
  | `note:${string}`

export type Navigate = (view: WorkspaceView) => void

/** Interim local note until Phase 3 moves notes to `/v1/notes`. */
export type NoteRecord = {
  id: string
  title: string
  excerpt: string
  /** Primary Space (backend `Note.spaceId`); null for a standalone note. */
  spaceId: string | null
  updatedAt: number
  document: IncantlyDocument
}

export type SpaceStatus = Exclude<Schema<'SpaceDto'>['status'], 'DELETED'>
export type SpaceRecord = {
  id: string
  name: string
  description: string | null
  icon: string | null
  homeNoteId: string | null
  status: SpaceStatus
  updatedAt: number
}

export type SourceKind = Schema<'SourceDto'>['kind']
export type SourceStatus = Schema<'SourceDto'>['status']
export type Sensitivity = Schema<'SourceDto'>['sensitivity']
export type SourceRecord = {
  id: string
  kind: SourceKind
  title: string
  status: SourceStatus
  sensitivity: Sensitivity
  updatedAt: number
}

export type SpaceSourceLink = { spaceId: string; sourceId: string; enabledByDefault: boolean; priority: number }

export const sourceKinds: { kind: SourceKind; label: string; icon: IconName }[] = [
  { kind: 'FILE', label: 'File', icon: 'pdf' },
  { kind: 'AUDIO_TRANSCRIPT', label: 'Audio', icon: 'audio' },
  { kind: 'YOUTUBE_TRANSCRIPT', label: 'YouTube', icon: 'video' },
  { kind: 'WEB_PAGE', label: 'Web page', icon: 'globe' },
  { kind: 'PASTED_TEXT', label: 'Pasted text', icon: 'clipboard' },
  { kind: 'NOTE_REVISION', label: 'Note', icon: 'history' },
]

export function sourceKindMeta(kind: SourceKind) {
  return sourceKinds.find((item) => item.kind === kind) ?? sourceKinds[0]
}

export const sensitivities: { value: Sensitivity; label: string; help: string }[] = [
  { value: 'PUBLIC', label: 'Public', help: 'Published material anyone could read.' },
  { value: 'PRIVATE', label: 'Private', help: 'Your own material. The default.' },
  { value: 'SENSITIVE', label: 'Sensitive', help: 'Personal or confidential material. Handled with extra care.' },
  { value: 'RESTRICTED', label: 'Restricted', help: 'Never sent to an external AI provider, so AI requests over it fail.' },
]

/** Space Source priority presets over the backend's −100…100 range. */
export const priorityPresets = [
  { value: -50, label: 'Low' },
  { value: 0, label: 'Normal' },
  { value: 50, label: 'High' },
] as const

export function priorityLabel(priority: number) {
  return priority < -25 ? 'Low' : priority > 25 ? 'High' : 'Normal'
}

export function isUsableSource(source: Pick<SourceRecord, 'status'>) {
  return source.status === 'READY' || source.status === 'PARTIALLY_READY'
}
