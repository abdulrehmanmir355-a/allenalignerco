import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.ALLEN_TEST_BUILD === "true" ? ".next-codex-test" : ".next",
  allowedDevOrigins: ["192.168.1.24"],
  async headers() {
    return [
      { source: "/doctor-dashboard/:path*", headers: [{ key: "Cache-Control", value: "private, no-store" }, { key: "Referrer-Policy", value: "same-origin" }] },
      { source: "/api/:path*", headers: [{ key: "Cache-Control", value: "private, no-store" }, { key: "X-Content-Type-Options", value: "nosniff" }] },
    ];
  },
  async rewrites() {
    return [{ source: "/owner-login", destination: "/hr/login?portal=owner" }];
  },
  experimental: {
    agentFeedback: true,
    ...(process.env.ALLEN_TEST_BUILD === "true" ? { cpus: 1, webpackBuildWorker: false } : {}),
  },
  cacheComponents: false,

  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
