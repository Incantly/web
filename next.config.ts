import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR || '.next',
  async rewrites() {
    return [{ source: '/api/auth/:path*', destination: (process.env.AUTH_BACKEND_URL ?? 'http://localhost:3002') + '/api/auth/:path*' }];
  },
  transpilePackages: ['@incantly/core', '@incantly/canvas-react', 'three', 'gsap'],
  turbopack: { root: path.resolve(process.cwd(), '../..') },
};

export default nextConfig;
