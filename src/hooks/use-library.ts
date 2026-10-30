'use client'

import { useFeatureContext } from '@/components/product/features/createFeatureContext'
import { LibraryContext, type LibraryValue } from '@/components/product/features/library/LibraryProvider'

/** `/v1/library`: the Library's Sources and adding new ones. Must be used inside `WorkspaceProviders`. */
export function useLibrary(): LibraryValue {
  return useFeatureContext(LibraryContext)
}
