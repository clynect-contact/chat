import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { hasValidSession, getAccessCode } from "../session.js";
import { AppError } from "./errors.js";
export const COPILOT_COOKIE = "clynect_copilot_owner";
function secret() {
  const key = process.env.ACCESS_SESSION_SECRET || getAccessCode();
  if (!key) throw new AppError("AUTH_UNAVAILABLE", 503);
  return key;
}
function sign(payload: string) {
  return createHmac("sha256", secret())
    .update(`copilot-owner:${payload}`)
    .digest("base64url");
}
export function createOwnerToken() {
  const id = randomUUID(),
    expires = Date.now() + 7 * 86400000;
  const payload = Buffer.from(JSON.stringify({ id, expires })).toString(
    "base64url",
  );
  return { id, token: `${payload}.${sign(payload)}` };
}
export function verifyOwner(token: string) {
  const [payload, signature, ...rest] = token.split(".");
  if (!payload || !signature || rest.length) return null;
  const expected = Buffer.from(sign(payload)),
    actual = Buffer.from(signature);
  if (
    expected.length !== actual.length ||
    !timingSafeEqual(Uint8Array.from(expected), Uint8Array.from(actual))
  )
    return null;
  try {
    const value = JSON.parse(Buffer.from(payload, "base64url").toString());
    return typeof value.id === "string" &&
      /^[0-9a-f-]{36}$/.test(value.id) &&
      typeof value.expires === "number" &&
      value.expires > Date.now()
      ? value.id
      : null;
  } catch {
    return null;
  }
}
export function requireChatAccess(cookie: string | undefined) {
  if (!getAccessCode()) throw new AppError("AUTH_UNAVAILABLE", 503);
  try {
    if (!hasValidSession(cookie)) throw new AppError("SIGN_IN_REQUIRED", 401);
  } catch {
    throw new AppError("SIGN_IN_REQUIRED", 401);
  }
}
export function ownerSession(cookie: string | undefined, create = false) {
  requireChatAccess(cookie);
  let token: string | undefined;
  try {
    token = cookie
      ?.split(";")
      .map((v) => v.trim())
      .find((v) => v.startsWith(`${COPILOT_COOKIE}=`))
      ?.slice(COPILOT_COOKIE.length + 1);
  } catch {}
  const id = token ? verifyOwner(token) : null;
  if (id) return { id, cookie: null };
  if (!create) throw new AppError("SESSION_REQUIRED", 401);
  const next = createOwnerToken();
  return {
    id: next.id,
    cookie: `${COPILOT_COOKIE}=${next.token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800${process.env.NODE_ENV === "production" ? "; Secure" : ""}`,
  };
}
