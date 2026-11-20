import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

export const requestIdHeader = "X-Request-Id";

export function logRequest(req: Request, res: Response, next: NextFunction) {
  const requestId = randomUUID();
  const started = performance.now();
  res.setHeader(requestIdHeader, requestId);
  res.once("close", () => {
    // Express route patterns are registered by the application. Raw URLs can contain secrets.
    const route = typeof req.route?.path === "string" ? req.route.path : null;
    process.stdout.write(
      JSON.stringify({
        requestId,
        method: req.method,
        route,
        status: res.writableFinished ? res.statusCode : 499,
        durationMs: Math.round(performance.now() - started),
      }) + "\n",
    );
  });
  next();
}
