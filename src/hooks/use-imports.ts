'use client'

import { useFeatureContext } from '@/components/product/features/createFeatureContext'
import { ImportsContext, type ImportsValue } from '@/components/product/features/imports/ImportsProvider'

/** `/v1/imports`: tracked imports and reloading a note when one into it finishes. Must be used inside `WorkspaceProviders`. */
export function useImports(): ImportsValue {
  return useFeatureContext(ImportsContext)
}
