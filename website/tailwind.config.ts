import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        base: '#0a0a0a',
        card: '#111111',
        hover: '#1a1a1a',
        border: '#1f1f1f',
        muted: '#6b7280',
        primary: '#e5e5e5',
        green: '#22c55e',
        amber: '#f59e0b',
        red: '#ef4444',
        blue: '#60a5fa',
        purple: '#a78bfa',
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
}

export default config
