import type { NextConfig } from "next";

const isDevelopment = process.env.NODE_ENV !== "production";

const strictPolicy = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
  "worker-src 'self'",
  "manifest-src 'self'",
].join("; ");

// Vinext/React currently emits small inline hydration and component-style values.
// Same-origin connections are limited to loading/caching the static app shell;
// client features contain no personal-data transport code.
const enforcedPolicy = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  isDevelopment ? "connect-src 'self' ws:" : "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
  "worker-src 'self'",
  "manifest-src 'self'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: enforcedPolicy },
  ...(isDevelopment
    ? [{ key: "Content-Security-Policy-Report-Only", value: strictPolicy }]
    : []),
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains",
  },
  {
    key: "Permissions-Policy",
    value:
      "camera=(), microphone=(), geolocation=(), payment=(), usb=(), bluetooth=(), browsing-topics=(), accelerometer=(), gyroscope=(), magnetometer=()",
  },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
