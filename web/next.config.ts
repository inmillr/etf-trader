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
  eslint: {
    ignoreDuringBuilds: true
  }
};

export default nextConfig;
