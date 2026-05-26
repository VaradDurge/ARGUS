import RunDetailRedirectClient from './RunDetailClient'

export function generateStaticParams() {
  return [{ id: '_' }]
}

export default function RunDetailPage({ params }: { params: { id: string } }) {
  return <RunDetailRedirectClient id={params.id} />
}
