
const isDev = process.env.NODE_ENV === 'development'

const nextConfig = {
  reactStrictMode: true,
  // Static export for local bundled UI; on Vercel, use standard SSR
  ...(process.env.VERCEL ? {} : { output: 'export', trailingSlash: true }),
  images: {
    unoptimized: true,
    remotePatterns: [
      { protocol: 'https', hostname: '*.googleusercontent.com' },
    ],
  },
  // In dev, proxy /api/* to the running argus Python server (port 7842)
  // Rewrites are ignored during static export builds
  ...(isDev ? {
    async rewrites() {
      return [
        { source: '/api/:path*', destination: 'http://localhost:7842/api/:path*' },
      ]
    },
  } : {}),
}

export default nextConfig
