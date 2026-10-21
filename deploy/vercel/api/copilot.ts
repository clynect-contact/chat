import type { VercelRequest, VercelResponse } from "@vercel/node";
import { CopilotService } from "./_lib/copilot/service.js";
import { storage } from "./_lib/copilot/storage.js";
import { extract } from "./_lib/copilot/provider.js";
import { ownerSession } from "./_lib/copilot/session.js";
import { guard, failure } from "./_lib/copilot/http.js";
import { AppError } from "./_lib/copilot/errors.js";
export const config = { maxDuration: 60 };
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    guard(req, res);
    const action = req.query.action;
    if (typeof action !== "string") throw new AppError("NOT_FOUND", 404);
    const owner = ownerSession(
      req.headers.cookie,
      action === "session" && req.method === "GET",
    );
    if (owner.cookie) res.setHeader("Set-Cookie", owner.cookie);
    const service = new CopilotService(storage(), extract, owner.id);
    let result: unknown;
    if (req.method === "GET") {
      if (action === "conversation" && typeof req.query.id === "string")
        result = (await service.conversation(req.query.id)).data;
      else if (action === "session") result = await service.session();
      else if (action === "conversations") result = await service.list();
      else if (action === "drafts") result = await service.drafts();
      else throw new AppError("NOT_FOUND", 404);
    } else if (req.method === "POST") {
      if (JSON.stringify(req.body ?? {}).length > 20000)
        throw new AppError("INVALID_REQUEST", 413);
      switch (action) {
        case "session":
          result = await service.session(req.body);
          break;
        case "conversations":
          result = await service.create(req.body);
          break;
        case "respond":
          result = await service.respond(req.body);
          break;
        case "edit":
          result = await service.edit(req.body);
          break;
        case "actions":
          result = await service.action(req.body);
          break;
        case "feedback":
          result = await service.feedback(req.body);
          break;
        default:
          throw new AppError("NOT_FOUND", 404);
      }
    } else throw new AppError("METHOD_NOT_ALLOWED", 405);
    return res.status(200).json(result);
  } catch (error) {
    return failure(res, error);
  }
}
