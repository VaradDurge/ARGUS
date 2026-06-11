import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Learned Patterns',
  description:
    'Review and manage learned failure patterns. Approve or reject AI-suggested signatures to improve local detection.',
  alternates: { canonical: '/patterns' },
}

export default function PatternsLayout({ children }: { children: React.ReactNode }) {
  return children
}
