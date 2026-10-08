/** App Store / Play Store URLs. Empty = stay on this landing (#get-app). */
export function storeHref(kind: 'ios' | 'android'): string {
  const raw =
    kind === 'ios' ? process.env.NEXT_PUBLIC_IOS_STORE_URL : process.env.NEXT_PUBLIC_ANDROID_STORE_URL
  const base = raw?.replace(/\/$/, '') ?? ''
  return base || '#get-app'
}
