import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  transpilePackages: ['@incantly/core', '@incantly/canvas-react', 'three', 'gsap'],
  turbopack: { root: path.resolve(process.cwd(), '../..') },
};

export default nextConfig;
