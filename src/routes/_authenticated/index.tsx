import { createFileRoute } from '@tanstack/react-router'
import { ExplorerPage } from '@/features/explorer'

export const Route = createFileRoute('/_authenticated/')({
  component: ExplorerPage,
})
