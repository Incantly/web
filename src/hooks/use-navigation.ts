'use client'

import { useFeatureContext } from '@/components/product/features/createFeatureContext'
import { NavigationContext, type NavigationValue } from '@/components/product/features/navigation/NavigationProvider'

/** The current page, URL sync, and opening notes and Sources. Must be used inside `WorkspaceProviders`. */
export function useNavigation(): NavigationValue {
  return useFeatureContext(NavigationContext)
}
