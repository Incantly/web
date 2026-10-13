import type { Metadata } from 'next'
import { Workspace } from '../../components/product/Workspace'

export const metadata: Metadata = { title: 'Notes · Incantly' }

export default function NotesPage() {
  return <Workspace />
}
