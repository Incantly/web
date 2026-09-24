import type { Metadata } from 'next'
import { Workspace } from '../../components/product/Workspace'

export const metadata: Metadata = { title: 'Workspace · Incantly' }

export default function DashboardPage() {
  return <Workspace />
}
