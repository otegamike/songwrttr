import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ["mongoose"],
  async headers() {
    const csp = [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "form-action 'self' https://accounts.google.com",
      // React's development overlay uses eval for source-mapped call stacks.
      // Keep this relaxation out of production builds.
      `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://*.googleusercontent.com",
      "font-src 'self' data:",
      `connect-src 'self' https://accounts.google.com https://oauth2.googleapis.com https://www.googleapis.com https://upload.googleapis.com${process.env.NODE_ENV === "development" ? " ws://localhost:* wss://localhost:*" : ""}`,
      "media-src 'self' blob:",
      "upgrade-insecure-requests",
    ].join("; ");
    return [{ source: "/:path*", headers: [
      { key: "Content-Security-Policy", value: csp },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=()" },
    ] }];
  },
};

export default nextConfig;
