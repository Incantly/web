import type { Metadata } from 'next'
import { noIndex } from '../../lib/brand/siteMetadata'
import { Workspace } from '../../components/product/Workspace'

export const metadata: Metadata = { title: 'Notes · Incantly', ...noIndex }

export default function NotesPage() {
  return <Workspace />
}
