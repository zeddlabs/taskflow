import type { NextConfig } from "next";
import { apiOrigin } from "./src/features/auth/api-origin.ts";

const config: NextConfig = {
  async rewrites() {
    return [
      { source: "/api/v1/:path*", destination: apiOrigin() + "/api/v1/:path*" },
    ];
  },
};
export default config;
