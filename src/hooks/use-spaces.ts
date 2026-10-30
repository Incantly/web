'use client'

import { useFeatureContext } from '@/components/product/features/createFeatureContext'
import { SpacesContext, type SpacesValue } from '@/components/product/features/spaces/SpacesProvider'

/** `/v1/spaces`: the Spaces list, the open Space, and creating Spaces. Must be used inside `WorkspaceProviders`. */
export function useSpaces(): SpacesValue {
  return useFeatureContext(SpacesContext)
}
