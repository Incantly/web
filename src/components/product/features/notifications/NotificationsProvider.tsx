'use client'

import type { ReactNode } from 'react'
import { NotificationsContext, useNotificationsState } from '@/hooks/use-notifications'

/** Shares the notification inbox, preferences and mutes. The logic lives in `useNotificationsState` (`src/hooks/use-notifications.ts`); this runs it once and shares it. */
export function NotificationsProvider({ children }: { children: ReactNode }) {
  return <NotificationsContext.Provider value={useNotificationsState()}>{children}</NotificationsContext.Provider>
}
