import { randomUUID } from "node:crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { storage } from "./_lib/copilot/storage.js";
import { ownerSession } from "./_lib/copilot/session.js";
import { extractDocument } from "./_lib/copilot/files.js";
import { guard, failure } from "./_lib/copilot/http.js";
import { AppError, assert } from "./_lib/copilot/errors.js";
export const config = { api: { bodyParser: false }, maxDuration: 60 };
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    guard(req, res);
    assert(req.method === "POST", "METHOD_NOT_ALLOWED", 405);
    const owner = ownerSession(req.headers.cookie);
    const db = storage();
    await db.consume(owner.id);
    let size = 0;
    const chunks: Uint8Array[] = [];
    for await (const chunk of req) {
      const data = Uint8Array.from(chunk);
      size += data.length;
      assert(size <= 4 * 1024 * 1024 + 65536, "FILE_TOO_LARGE", 413);
      chunks.push(data);
    }
    let form: FormData;
    try {
      form = await new Response(Uint8Array.from(Buffer.concat(chunks)), {
        headers: { "content-type": req.headers["content-type"] ?? "" },
      }).formData();
    } catch {
      throw new AppError("INVALID_FILE");
    }
    assert(form.get("consent") === "true", "CONSENT_REQUIRED");
    const purpose = form.get("purpose");
    assert(purpose === "mission" || purpose === "profile", "INVALID_REQUEST");
    const file = form.get("file");
    assert(file instanceof File, "INVALID_FILE");
    assert(file.name.length <= 200, "INVALID_FILE");
    const text = await extractDocument(
      new Uint8Array(await file.arrayBuffer()),
      file.name,
      file.type,
    );
    const id = randomUUID();
    await db.create(owner.id, "file", id, {
      text,
      purpose,
      name: file.name,
      consentedAt: new Date().toISOString(),
    });
    return res.status(200).json({ id, name: file.name, size: file.size });
  } catch (error) {
    return failure(res, error);
  }
}
