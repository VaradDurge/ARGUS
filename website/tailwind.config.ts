import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        base: '#f8f9fb',
        card: '#ffffff',
        hover: '#f3f4f6',
        border: '#e5e7eb',
        muted: '#6b7280',
        primary: '#111827',
        green: '#10b981',
        amber: '#f59e0b',
        red: '#ef4444',
        blue: '#6366f1',
        purple: '#a855f7',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
        mono: ['var(--font-mono)', 'DM Mono', 'JetBrains Mono', 'Menlo', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
}

export default config
