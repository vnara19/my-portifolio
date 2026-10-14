import type { NextConfig } from "next";

const nextConfig: NextConfig = {

  distDir: process.env.PORTFOLIO_TEST_DIST_DIR ?? ".next",
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
