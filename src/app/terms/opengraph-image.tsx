import { ogCard, ogContentType, ogSize } from '../../lib/brand/ogCard'

export const alt = 'Incantly Terms of Service'
export const size = ogSize
export const contentType = ogContentType

export default function Image() {
  return ogCard({ eyebrow: 'Legal', title: 'Terms of Service', subtitle: 'The agreement between you and Genesis HQ for using Incantly.' })
}
