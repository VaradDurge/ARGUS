import type { Metadata } from 'next'
import { DM_Mono } from 'next/font/google'
import Sidebar from '@/components/Sidebar'
import Topbar from '@/components/Topbar'
import { AuthProvider } from '@/lib/auth'
import './globals.css'

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
    <html lang="en" className={`dark ${dmMono.variable}`}>
      <body className="min-h-screen text-[var(--text-primary)] flex">
        <AuthProvider>
          <Sidebar />

          {/* Right column: topbar + page content */}
          <div className="flex-1 flex flex-col min-h-screen overflow-hidden">
            <Topbar />
            <main className="flex-1 overflow-auto">
              <div className="max-w-6xl mx-auto px-8 py-10">
                {children}
              </div>
            </main>
          </div>
        </AuthProvider>
      </body>
    </html>
  )
}
