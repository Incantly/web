import { ogCard, ogContentType, ogSize } from '../../lib/brand/ogCard'

export const alt = 'Incantly Privacy Policy'
export const size = ogSize
export const contentType = ogContentType

export default function Image() {
  return ogCard({ eyebrow: 'Legal', title: 'Privacy Policy', subtitle: 'How we collect, use and protect your personal data.' })
}
