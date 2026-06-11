import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Feedback & Reports',
  description:
    'Submit feedback, report bugs, and request features for ARGUS — the AI agent pipeline monitoring platform.',
  alternates: { canonical: '/report' },
}

export default function ReportLayout({ children }: { children: React.ReactNode }) {
  return children
}
