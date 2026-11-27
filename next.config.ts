import type { NextConfig } from "next";

const nextConfig: NextConfig = {

  poweredByHeader: false,
  distDir: process.env.PORTFOLIO_TEST_DIST_DIR ?? ".next",
  async headers() {
    return [{ source: "/(.*)", headers: [
      { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
    ] }];
  },
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
