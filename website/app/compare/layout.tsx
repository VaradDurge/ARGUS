import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Compare Runs',
  description:
    'Side-by-side comparison of AI agent pipeline runs. Visualize node-level diffs, performance changes, and failure analysis between pipeline executions.',
  alternates: { canonical: '/compare' },
}

export default function CompareLayout({ children }: { children: React.ReactNode }) {
  return children
}
