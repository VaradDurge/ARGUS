import type { Metadata } from 'next'
import { DM_Mono, Inter } from 'next/font/google'
import Sidebar from '@/components/Sidebar'
import Topbar from '@/components/Topbar'
import { AuthProvider } from '@/lib/auth'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
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
    <html lang="en" className={`${inter.variable} ${dmMono.variable}`}>
      <body className="h-screen overflow-hidden text-[var(--text-primary)] flex" style={{ background: 'var(--bg-base)' }}>
        <AuthProvider>
          <Sidebar />

          {/* Right column: topbar + page content */}
          <div className="flex-1 flex flex-col h-full overflow-hidden">
            <Topbar />
            <main className="flex-1 overflow-hidden">
              {children}
            </main>
          </div>
        </AuthProvider>
      </body>
    </html>
  )
}
