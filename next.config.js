/** @type {import('next').NextConfig} */

// The KV store is Upstash Redis. Depending on how it was connected in
// Vercel (Storage tab vs. the Upstash Marketplace integration), the project
// gets either KV_REST_API_URL / KV_REST_API_TOKEN or UPSTASH_REDIS_REST_URL /
// UPSTASH_REDIS_REST_TOKEN. Accept either pair. Only server code (API
// routes, middleware, lib/*Store.js) reads these, so the token is never
// shipped to the browser.
const KV_REST_API_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '';
const KV_REST_API_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';

const nextConfig = {
  reactStrictMode: true,
  env: { KV_REST_API_URL, KV_REST_API_TOKEN },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
};

module.exports = nextConfig;
