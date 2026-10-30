/** @type {import('next').NextConfig} */
const API_URL = process.env.API_URL ?? 'http://localhost:4000';

const nextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  // The browser talks to /api/*, proxied to the Node API, so session cookies stay first-party.
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${API_URL}/v1/:path*` }];
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self)' },
        ],
      },
    ];
  },
};

export default nextConfig;
