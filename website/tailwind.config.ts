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
        background: 'var(--bg-surface)',
        foreground: 'var(--text-primary)',
        'primary-foreground': '#ffffff',
        secondary: { DEFAULT: 'var(--bg-elevated)', foreground: 'var(--text-primary)' },
        'accent': { DEFAULT: 'var(--bg-elevated)', foreground: 'var(--text-primary)' },
        'accent-foreground': 'var(--text-primary)',
        destructive: { DEFAULT: '#ef4444', foreground: '#ffffff' },
        'muted-foreground': 'var(--text-secondary)',
        input: 'var(--border-default)',
        ring: '#6366f1',
      },
      spacing: {
        '1.25': '0.3125rem',
        '8.5': '2.125rem',
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
