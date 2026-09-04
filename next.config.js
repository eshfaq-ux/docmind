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
};

module.exports = nextConfig;
