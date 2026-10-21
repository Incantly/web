import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR || '.next',
  async rewrites() {
    const backend = process.env.AUTH_BACKEND_URL ?? 'http://localhost:3002';
    return [
      { source: '/api/auth/:path*', destination: `${backend}/api/auth/:path*` },
      // Same-origin product API: cookies and Origin pass through unchanged. Presigned storage URLs are never proxied.
      { source: '/v1/:path*', destination: `${backend}/v1/:path*` },
    ];
  },
  transpilePackages: ['@incantly/core', '@incantly/canvas-react', 'three', 'gsap'],
  turbopack: { root: path.resolve(process.cwd(), '../..') },
};

export default nextConfig;
