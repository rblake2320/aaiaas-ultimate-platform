/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === 'production';

const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  poweredByHeader: false,
  
  async headers() {
    // Note: This CSP is intentionally conservative to avoid breaking Next.js runtime.
    // It still blocks most third-party script injection by default.
    const csp = [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "form-action 'self'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "connect-src 'self' https: http:",
      // Next.js typically requires inline scripts/styles unless you implement nonces.
      "script-src 'self' 'unsafe-inline'" + (isProd ? '' : " 'unsafe-eval'"),
      "style-src 'self' 'unsafe-inline'",
      "upgrade-insecure-requests",
    ].join('; ');

    return [
      {
        source: '/(.*)',
        headers: [
          ...(isProd
            ? [
                {
                  key: 'Strict-Transport-Security',
                  value: 'max-age=63072000; includeSubDomains; preload',
                },
              ]
            : []),
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Content-Security-Policy',
            value: csp,
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
          {
            key: 'Cross-Origin-Opener-Policy',
            value: 'same-origin',
          },
          {
            key: 'Cross-Origin-Resource-Policy',
            value: 'same-origin',
          },
        ],
      },
    ];
  },

  images: {
    domains: ['localhost'],
    formats: ['image/avif', 'image/webp'],
  },

  experimental: {
    optimizePackageImports: ['lucide-react'],
  },
};

module.exports = nextConfig;
