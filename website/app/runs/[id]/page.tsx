import RunDetailClient from './RunDetailClient'

export function generateStaticParams() {
  return [{ id: '_' }]
}

export default function RunDetailPage({ params }: { params: { id: string } }) {
  return <RunDetailClient id={params.id} />
}
