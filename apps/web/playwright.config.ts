import { defineConfig } from "@playwright/test";
import { randomBytes } from "node:crypto";
import { apiOrigin } from "./src/features/auth/api-origin";

const api = new URL(apiOrigin());
if (
  !process.env.DATABASE_URL ||
  api.hostname !== "127.0.0.1" ||
  api.protocol !== "http:" ||
  !api.port
)
  throw new Error(
    "Use a disposable migrated DATABASE_URL and a loopback API origin with a port for browser tests.",
  );
const webPort = Number(process.env.TASKFLOW_E2E_WEB_PORT ?? 3107);
const origin = "http://127.0.0.1:" + webPort;
export default defineConfig({
  testDir: "./test/e2e",
  workers: 1,
  use: {
    baseURL: origin,
    browserName: "chromium",
    colorScheme: "light",
    viewport: { width: 1360, height: 880 },
  },
  webServer: [
    {
      command: "node ../api/test/auth-server.mjs",
      url: api.origin + "/api/v1/health/live",
      env: {
        NODE_ENV: "test",
        PORT: api.port,
        WEB_ORIGIN: origin,
        COOKIE_SECURE: "false",
        JWT_ACCESS_SECRET: randomBytes(32).toString("hex"),
        CSRF_SECRET: randomBytes(32).toString("hex"),
      },
    },
    {
      command:
        "node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port " +
        webPort,
      url: origin + "/login",
      env: { NODE_ENV: "production" },
    },
  ],
});
