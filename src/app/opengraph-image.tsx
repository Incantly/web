import { ogCard, ogContentType, ogSize } from '../lib/brand/ogCard'

export const alt = 'Incantly: bring your notes to life'
export const size = ogSize
export const contentType = ogContentType

export default function Image() {
  return ogCard({ eyebrow: 'Your notes, alive', title: 'Bring your notes to life', subtitle: 'Ask questions, see ideas in 3D, and run simulations inside your notes.' })
}
