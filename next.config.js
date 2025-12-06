// next.config.js
const withPWA = require("next-pwa")({
  dest: "public",
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === "development",
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // ✅ απαραίτητο για Next 16 + Turbopack ώστε να μην γκρινιάζει για lockfiles/workspace root
  outputFileTracingRoot: __dirname,

  // ✅ “silence” το Turbopack/webpack conflict — βάζουμε turbopack config κενό
  turbopack: {},
};

module.exports = withPWA(nextConfig);
