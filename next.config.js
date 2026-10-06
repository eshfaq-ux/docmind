/** @type {import('next').NextConfig} */
const nextConfig = {
  // Required for pdfjs-dist and other Node-only packages
  experimental: {
    serverComponentsExternalPackages: ["tiktoken", "@node-rs/argon2"],
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "lh3.googleusercontent.com" }, // Google avatars
    ],
  },
  // Silence warnings about dynamic server usage (we use force-dynamic where needed)
  logging: {
    fetches: { fullUrl: process.env.NODE_ENV === "development" },
  },
  // Standalone output for Docker builds (copies only required node_modules)
  output: process.env.DOCKER_BUILD === "1" ? "standalone" : undefined,

  // Security headers — applied to all routes
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options",   value: "nosniff" },
          { key: "X-Frame-Options",           value: "DENY" },
          { key: "X-XSS-Protection",          value: "1; mode=block" },
          { key: "Referrer-Policy",           value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy",        value: "camera=(), microphone=(), geolocation=()" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // unsafe-eval needed by Next.js dev
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com",
              "img-src 'self' data: blob: https://lh3.googleusercontent.com",
              "connect-src 'self' https://*.upstash.io https://*.openrouter.ai https://*.neon.tech",
              "frame-ancestors 'none'",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
