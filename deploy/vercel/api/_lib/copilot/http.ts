import type { VercelRequest, VercelResponse } from "@vercel/node";
import { ZodError } from "zod";
import { AppError, assert } from "./errors.js";
export function guard(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store");
  assert(process.env.COPILOT_ENABLED === "true", "COPILOT_DISABLED", 503);
  if (req.method !== "GET") {
    const origin = req.headers.origin;
    let sameOrigin = false;
    try {
      sameOrigin =
        typeof origin === "string" && new URL(origin).host === req.headers.host;
    } catch {}
    assert(sameOrigin, "FORBIDDEN", 403);
  }
}
export function failure(res: VercelResponse, error: unknown) {
  const known = error instanceof AppError;
  return res
    .status(known ? error.status : error instanceof ZodError ? 400 : 500)
    .json({
      error: known
        ? error.code
        : error instanceof ZodError
          ? "INVALID_REQUEST"
          : "SERVER_ERROR",
    });
}
