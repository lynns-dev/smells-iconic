/** @type {import('next').NextConfig} */

// The KV store is Upstash Redis. Depending on how it was connected in
// Vercel (Storage tab vs. the Upstash Marketplace integration), the project
// gets either KV_REST_API_URL / KV_REST_API_TOKEN or UPSTASH_REDIS_REST_URL /
// UPSTASH_REDIS_REST_TOKEN. Accept either pair. Only server code (API
// routes, middleware, lib/*Store.js) reads these, so the token is never
// shipped to the browser.
// Vercel can also add a custom prefix when a store is connected (e.g.
// smellsiconic_KV_REST_API_URL), so any <prefix>_<name> is accepted too.
function fromEnv(...names) {
  for (const name of names) {
    if (process.env[name]) return process.env[name];
  }
  for (const name of names) {
    const prefixed = Object.keys(process.env).find((key) => key.endsWith(`_${name}`) && process.env[key]);
    if (prefixed) return process.env[prefixed];
  }
  return '';
}

const KV_REST_API_URL = fromEnv('KV_REST_API_URL', 'UPSTASH_REDIS_REST_URL');
const KV_REST_API_TOKEN = fromEnv('KV_REST_API_TOKEN', 'UPSTASH_REDIS_REST_TOKEN');

const nextConfig = {
  reactStrictMode: true,
  env: { KV_REST_API_URL, KV_REST_API_TOKEN },
  // Apple Pay domain verification file, served by a function (see
  // pages/api/apple-pay-domain-verification.js for why).
  async rewrites() {
    return [
      {
        source: '/.well-known/apple-developer-merchantid-domain-association',
        destination: '/api/apple-pay-domain-verification',
      },
    ];
  },
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
