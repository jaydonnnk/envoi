import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

// The buyer scan page is the one page that may ask for the camera, and only for this site's own
// document (S10). Microphone and geolocation stay off there too.
const SCAN_PAGE_PATH = "/buy/scan";
const scanPageHeaders = [{ key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" }];

const GENERATED_CLIENT_SOURCE = fileURLToPath(new URL("./clients/typescript/src", import.meta.url));

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // next dev would otherwise append its own block to AGENTS.md, which holds this repository's
  // reviewed agent instructions.
  agentRules: false,
  // The framework image optimizer stays unused (Gate 3, Files).
  images: { unoptimized: true },
  // S25: Ask Envoi's route runs the APIMatic-generated client from source. Its modules import each
  // other as "./client.js" for client.ts, so inside that folder alone a .js import also tries .ts.
  webpack(config) {
    config.module.rules.push({ include: GENERATED_CLIENT_SOURCE, resolve: { extensionAlias: { ".js": [".ts", ".js"] } } });
    return config;
  },
  async headers() {
    // When two entries set the same header for a path, the later one wins, so the scan page's entry
    // comes last.
    return [
      { source: "/:path*", headers: securityHeaders },
      { source: SCAN_PAGE_PATH, headers: scanPageHeaders },
    ];
  },
};

export default nextConfig;
