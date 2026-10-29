import type { IconName } from '../AppIcon'
import type { Schema } from '../../../lib/api/types'
import type { SourceDto } from '../../../lib/api/library'
import type { SpaceDto } from '../../../lib/api/spaces'

export type WorkspaceView =
  | 'home'
  | 'search'
  | 'notes'
  | 'spaces'
  | 'library'
  | `space:${string}`
  | `note:${string}`

export type Navigate = (view: WorkspaceView) => void

/** A note as listed from `GET /v1/notes`. */
export type NoteRecord = {
  id: string
  title: string
  updatedAt: number
  /**
   * The note's Space when this screen knows it (opened from that Space). The notes list has no
   * Space field yet (gap G1), so this is null elsewhere.
   */
  spaceId: string | null
  /** For adding the note to the Library as a fixed revision. */
  currentRevisionId: string | null
}

export type SpaceStatus = Exclude<Schema<'SpaceDto'>['status'], 'DELETED'>
export type SpaceRecord = {
  id: string
  name: string
  description: string | null
  icon: string | null
  homeNoteId: string | null
  status: SpaceStatus
  retentionHold: boolean
  updatedAt: number
}

export function toSpaceRecord(space: SpaceDto): SpaceRecord {
  return { id: space.id, name: space.name, description: space.description, icon: space.icon, homeNoteId: space.homeNoteId, status: space.status === 'ARCHIVED' ? 'ARCHIVED' : 'ACTIVE', retentionHold: space.retentionHold, updatedAt: Date.parse(space.updatedAt) || 0 }
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
  /** The newest version's processing facts (lists return only the latest version). */
  stage: string | null
  failureCode: string | null
  partialReason: string | null
  assetId: string | null
}

export function toSourceRecord(source: SourceDto): SourceRecord {
  const latest = source.versions[0]
  return {
    id: source.id, kind: source.kind, title: source.title, status: source.status, sensitivity: source.sensitivity, updatedAt: Date.parse(source.updatedAt) || 0,
    stage: latest?.processingStage ?? null, failureCode: latest?.failureCode ?? null, partialReason: latest?.partialReason ?? null, assetId: latest?.assetId ?? null,
  }
}

export type SpaceSourceLink = { spaceId: string; sourceId: string; enabledByDefault: boolean; priority: number }

export const sourceKinds: { kind: SourceKind; label: string; icon: IconName }[] = [
  { kind: 'FILE', label: 'File', icon: 'pdf' },
  { kind: 'AUDIO_TRANSCRIPT', label: 'Audio', icon: 'audio' },
  { kind: 'YOUTUBE_TRANSCRIPT', label: 'YouTube', icon: 'play' },
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
