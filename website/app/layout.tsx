import type { Metadata } from 'next'
import { DM_Sans, DM_Mono } from 'next/font/google'
import Sidebar from '@/components/Sidebar'
import { AuthProvider } from '@/lib/auth'
import './globals.css'

const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600'],
  variable: '--font-sans',
  display: 'swap',
})

const dmMono = DM_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'ARGUS',
  description: 'Agentic Realtime Guard & Unified Scope — run inspector',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`dark ${dmSans.variable} ${dmMono.variable}`}>
      <body className="min-h-screen text-[var(--text-primary)] flex">
        {/* Grain overlay */}
        <div className="texture-grain" />

        <AuthProvider>
          <Sidebar />

          {/* Main content */}
          <main className="flex-1 overflow-auto min-h-screen relative z-10">
            <div className="max-w-6xl mx-auto px-8 py-10">
              {children}
            </div>
          </main>
        </AuthProvider>
      </body>
    </html>
  )
}
