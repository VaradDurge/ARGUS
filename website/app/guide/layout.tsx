import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Getting Started Guide',
  description:
    'Learn how to integrate ARGUS into your AI agent pipelines. Step-by-step setup for LangGraph, silent failure detection, semantic validation, and replay debugging.',
  alternates: { canonical: '/guide' },
}

export default function GuideLayout({ children }: { children: React.ReactNode }) {
  return children
}
