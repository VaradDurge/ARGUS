import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        base: '#0c0d12',
        card: '#141519',
        hover: '#1c1d24',
        border: '#2c2f3a',
        muted: '#5d6370',
        primary: '#e1e4ea',
        green: '#3d9e7d',
        amber: '#d49a2e',
        red: '#d65c5c',
        blue: '#7c7fc7',
        purple: '#9a6dc6',
        background: 'var(--bg-surface)',
        foreground: 'var(--text-primary)',
        'primary-foreground': '#0c0d12',
        secondary: { DEFAULT: 'var(--bg-elevated)', foreground: 'var(--text-primary)' },
        'accent': { DEFAULT: 'var(--bg-elevated)', foreground: 'var(--text-primary)' },
        'accent-foreground': 'var(--text-primary)',
        destructive: { DEFAULT: '#d65c5c', foreground: '#ffffff' },
        'muted-foreground': 'var(--text-secondary)',
        input: 'var(--border-default)',
        ring: '#7c7fc7',
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
