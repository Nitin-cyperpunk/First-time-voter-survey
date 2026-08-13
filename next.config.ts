import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Pin project root — avoids Turbopack picking D:\ when a parent lockfile exists. */
const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  outputFileTracingRoot: projectRoot,
  turbopack: {
    root: projectRoot,
  },
  async redirects() {
    return [
      {
        source: "/forms/innerwear_screener_v1.html",
        destination: "/register",
        permanent: false,
      },
      {
        source: "/forms/innerwear_screener_v2.html",
        destination: "/register",
        permanent: false,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/form/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store, must-revalidate" },
        ],
      },
      {
        source: "/forms/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store, must-revalidate" },
        ],
      },
      {
        source: "/",
        headers: [
          { key: "Cache-Control", value: "no-store, must-revalidate" },
        ],
      },
      {
        source: "/register",
        headers: [
          { key: "Cache-Control", value: "no-store, must-revalidate" },
        ],
      },
    ];
  },
};

export default nextConfig;
