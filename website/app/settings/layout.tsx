import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Settings',
  description: 'Configure ARGUS integrations and preferences.',
  alternates: { canonical: '/settings' },
}

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return children
}
