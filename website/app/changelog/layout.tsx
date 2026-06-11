import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Changelog',
  description:
    'Latest releases, features, and improvements to ARGUS — the production readiness platform for AI agent pipelines.',
  alternates: { canonical: '/changelog' },
}

export default function ChangelogLayout({ children }: { children: React.ReactNode }) {
  return children
}
