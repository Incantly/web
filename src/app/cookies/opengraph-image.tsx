import { ogCard, ogContentType, ogSize } from '../../lib/brand/ogCard'

export const alt = 'Incantly Cookie Policy'
export const size = ogSize
export const contentType = ogContentType

export default function Image() {
  return ogCard({ eyebrow: 'Legal', title: 'Cookie Policy', subtitle: 'The cookies Incantly uses, and how to control them.' })
}
