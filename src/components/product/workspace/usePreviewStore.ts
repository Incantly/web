'use client'

import { useCallback, useState } from 'react'
import type { Sensitivity, SourceKind, SourceRecord, SpaceRecord, SpaceSourceLink } from './model'

/**
 * Interim in-memory Spaces and Library so the redesigned screens are usable before the backend
 * is connected. Nothing here is persisted. Phase 5 replaces sources with `/v1/library/sources`;
 * Phase 6 replaces spaces and links with `/v1/spaces`.
 */
export type SpaceDraft = { name: string; description: string; icon: string }
export type SourceDraft = { kind: SourceKind; title: string; sensitivity: Sensitivity; spaceIds: string[] }

export function usePreviewStore() {
  const [spaces, setSpaces] = useState<SpaceRecord[]>([])
  const [sources, setSources] = useState<SourceRecord[]>([])
  const [links, setLinks] = useState<SpaceSourceLink[]>([])

  const createSpace = useCallback((draft: SpaceDraft) => {
    const space: SpaceRecord = { id: crypto.randomUUID(), name: draft.name.trim(), description: draft.description.trim() || null, icon: draft.icon.trim() || null, homeNoteId: null, status: 'ACTIVE', updatedAt: Date.now() }
    setSpaces((current) => [space, ...current])
    return space
  }, [])

  const updateSpace = useCallback((id: string, changes: Partial<Omit<SpaceRecord, 'id'>>) => {
    setSpaces((current) => current.map((space) => (space.id === id ? { ...space, ...changes, updatedAt: Date.now() } : space)))
  }, [])

  const deleteSpace = useCallback((id: string) => {
    setSpaces((current) => current.filter((space) => space.id !== id))
    setLinks((current) => current.filter((link) => link.spaceId !== id))
  }, [])

  const createSource = useCallback((draft: SourceDraft) => {
    const source: SourceRecord = { id: crypto.randomUUID(), kind: draft.kind, title: draft.title, status: 'PENDING', sensitivity: draft.sensitivity, updatedAt: Date.now() }
    setSources((current) => [source, ...current])
    setLinks((current) => [...current, ...draft.spaceIds.map((spaceId) => ({ spaceId, sourceId: source.id, enabledByDefault: true, priority: 0 }))])
    return source
  }, [])

  const updateSource = useCallback((id: string, changes: Partial<Omit<SourceRecord, 'id'>>) => {
    setSources((current) => current.map((source) => (source.id === id ? { ...source, ...changes, updatedAt: Date.now() } : source)))
  }, [])

  const deleteSource = useCallback((id: string) => {
    setSources((current) => current.filter((source) => source.id !== id))
    setLinks((current) => current.filter((link) => link.sourceId !== id))
  }, [])

  const linkSource = useCallback((spaceId: string, sourceId: string) => {
    setLinks((current) => (current.some((link) => link.spaceId === spaceId && link.sourceId === sourceId) ? current : [...current, { spaceId, sourceId, enabledByDefault: true, priority: 0 }]))
  }, [])

  const updateLink = useCallback((spaceId: string, sourceId: string, changes: Partial<Pick<SpaceSourceLink, 'enabledByDefault' | 'priority'>>) => {
    setLinks((current) => current.map((link) => (link.spaceId === spaceId && link.sourceId === sourceId ? { ...link, ...changes } : link)))
  }, [])

  const unlinkSource = useCallback((spaceId: string, sourceId: string) => {
    setLinks((current) => current.filter((link) => !(link.spaceId === spaceId && link.sourceId === sourceId)))
  }, [])

  return { spaces, sources, links, createSpace, updateSpace, deleteSpace, createSource, updateSource, deleteSource, linkSource, updateLink, unlinkSource }
}

export type PreviewStore = ReturnType<typeof usePreviewStore>
