import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    optimizePackageImports: [],
  },
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      "iceberg-js": false,
    };
    return config;
  },
};

export default nextConfig;
