import type { Metadata } from 'next'
import Sidebar from '@/components/Sidebar'
import './globals.css'

export const metadata: Metadata = {
  title: 'ARGUS',
  description: 'Agentic Realtime Guard & Unified Scope — run inspector',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen text-[var(--text-primary)] flex">
        {/* Grain overlay */}
        <div className="texture-grain" />

        <Sidebar />

        {/* Main content */}
        <main className="flex-1 overflow-auto min-h-screen relative z-10">
          <div className="max-w-6xl mx-auto px-8 py-10">
            {children}
          </div>
        </main>
      </body>
    </html>
  )
}
