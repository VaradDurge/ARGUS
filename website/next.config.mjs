
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
}

export default nextConfig
