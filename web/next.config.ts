import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import type { NextConfig } from "next";

const projectRoot = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);

dotenv.config({
  path: path.join(projectRoot, ".env")
});

const nextConfig: NextConfig = {
  env: {
    PROJECT_ROOT: projectRoot
  },
  outputFileTracingRoot: projectRoot,
  experimental: {
    externalDir: true
  },
  serverExternalPackages: [
    "better-sqlite3"
  ],
  typescript: {
    ignoreBuildErrors: false
  },
  eslint: {
    ignoreDuringBuilds: true
  },
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ".js": [
        ".ts",
        ".tsx",
        ".js"
      ]
    };

    return config;
  }
};

export default nextConfig;
