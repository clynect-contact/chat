import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { zipSync, strToU8 } from "fflate";
import { CopilotService } from "../api/_lib/copilot/service.js";
import { fixtureChanges } from "../api/_lib/copilot/extract.js";
import { extractDocument } from "../api/_lib/copilot/files.js";
import {
  createOwnerToken,
  verifyOwner,
  ownerSession,
} from "../api/_lib/copilot/session.js";
import { emptyDraft, applyChanges } from "../api/_lib/copilot/contracts.js";
import { guard } from "../api/_lib/copilot/http.js";
import { testStore } from "./copilot-store.js";
const extractor = async (text: any, draft: any) => fixtureChanges(text, draft);
process.env.ACCESS_CODE = "test-only-access-code";
process.env.ACCESS_SESSION_SECRET = "test-only-secret";
process.env.COPILOT_WRITES_ENABLED = "true";
test("anonymous browser ownership isolates sessions and rejects tampering", () => {
  delete process.env.ACCESS_CODE;
  const owner = createOwnerToken();
  assert.equal(verifyOwner(owner.token), owner.id);
  assert.equal(verifyOwner(owner.token + "x"), null);
  assert.throws(() => ownerSession(undefined), /SESSION_REQUIRED/);
  assert.equal(ownerSession("clynect_copilot_owner=" + owner.token).id, owner.id);
  const first = ownerSession(undefined, true);
  const second = ownerSession(undefined, true);
  assert.notEqual(first.id, second.id);
  assert.ok(first.cookie?.includes("HttpOnly"));
  assert.throws(() => ownerSession("clynect_copilot_owner=" + owner.token + "x"), /SESSION_REQUIRED/);
  delete process.env.ACCESS_SESSION_SECRET;
  assert.throws(() => ownerSession(undefined, true), /AUTH_UNAVAILABLE/);
  process.env.ACCESS_SESSION_SECRET = "test-only-secret";
});
test("mutation guard rejects missing and cross-origin requests; feature flag fails closed", () => {
  const res = { setHeader() {} } as any;
  process.env.COPILOT_ENABLED = "true";
  assert.throws(
    () =>
      guard(
        {
          method: "POST",
          headers: { host: "app.test", origin: "https://evil.test" },
        } as any,
        res,
      ),
    /FORBIDDEN/,
  );
  assert.throws(
    () => guard({ method: "POST", headers: { host: "app.test" } } as any, res),
    /FORBIDDEN/,
  );
  guard(
    {
      method: "POST",
      headers: { host: "app.test", origin: "https://app.test" },
    } as any,
    res,
  );
  delete process.env.COPILOT_ENABLED;
  assert.throws(
    () => guard({ method: "GET", headers: {} } as any, res),
    /COPILOT_DISABLED/,
  );
});
test("private ownership, extraction, edits, saved drafts and idempotent SQL transactions", async () => {
  const { pg, db } = await testStore();
  try {
    const owner = randomUUID(),
      other = randomUUID();
    const service = new CopilotService(db, extractor, owner),
      stranger = new CopilotService(db, extractor, other);
    const c = await service.create({ role: "talent", locale: "fr" });
    await assert.rejects(() => stranger.conversation(c.id), /NOT_FOUND/);
    const req = {
      conversationId: c.id,
      message:
        "Développeur React à Paris, 5 ans d’expérience, disponible immédiatement.",
      locale: "fr",
      requestId: randomUUID(),
    };
    const result = await service.respond(req);
    assert.equal(result.conversation.draft?.fields.years_experience, 5);
    assert.deepEqual(await service.respond(req), result);
    assert.equal((await service.conversation(c.id)).data.messages.length, 2);
    await assert.rejects(
      () => service.respond({ ...req, message: "Changed" }),
      /IDEMPOTENCY_CONFLICT/,
    );
    const revision = result.conversation.draft!.revision;
    const edited = await service.edit({
      conversationId: c.id,
      revision,
      field: "visibility",
      value: "secret",
    });
    await assert.rejects(
      () =>
        service.edit({
          conversationId: c.id,
          revision,
          field: "visibility",
          value: "visible",
        }),
      /CONFLICT/,
    );
    const action = {
      actionId: randomUUID(),
      tool: "save_profile_draft",
      conversationId: c.id,
      revision: edited.draft!.revision,
    };
    const saved = await service.action(action);
    assert.deepEqual(await service.action(action), saved);
    assert.equal((await service.drafts()).length, 1);
    assert.equal((await stranger.drafts()).length, 0);
    assert.equal(
      (await service.conversation(c.id)).data.draft!.saved_revision,
      edited.draft!.revision,
    );
    await assert.rejects(
      () => service.action({ ...action, actionId: randomUUID(), revision: 0 }),
      /CONFLICT/,
    );
    await assert.rejects(
      () => service.action({ ...action, tool: "save_mission_draft" }),
      /FORBIDDEN/,
    );
    const perms = await pg.query<{ allowed: boolean }>(
      "select has_table_privilege('anon','clynect_copilot_records','select') as allowed",
    );
    assert.equal(perms.rows[0].allowed, false);
    await pg.exec("set role anon");
    await assert.rejects(
      () => pg.query("select * from clynect_copilot_records"),
      /permission denied/,
    );
    await assert.rejects(
      () => pg.query("select clynect_copilot_consume($1,30,100)", [owner]),
      /permission denied/,
    );
    await pg.exec("reset role");
  } finally {
    await pg.close();
  }
});
test("provider failure preserves user message and retry does not duplicate it", async () => {
  const { pg, db } = await testStore();
  try {
    let calls = 0;
    const service = new CopilotService(
      db,
      async (t, d) => {
        if (++calls === 1) throw new Error("PROVIDER_FAILURE");
        return fixtureChanges(t, d);
      },
      randomUUID(),
    );
    const c = await service.create({ role: "business", locale: "en" }),
      req = {
        conversationId: c.id,
        message: "React developer in Paris",
        locale: "en",
        requestId: randomUUID(),
      };
    await assert.rejects(() => service.respond(req), /PROVIDER_FAILURE/);
    assert.equal((await service.conversation(c.id)).data.messages.length, 1);
    const r = await service.respond(req);
    assert.equal(r.conversation.messages.length, 2);
    assert.equal(calls, 2);
    await service.respond(req);
    assert.equal(calls, 2);
  } finally {
    await pg.close();
  }
});
test("conversation reply answers the latest message instead of returning a canned sheet status", async () => {
  const { pg, db } = await testStore();
  try {
    let latest = "";
    const service = new CopilotService(
      db,
      extractor,
      randomUUID(),
      async (context) => {
        latest = context.message;
        return "Live mission search is not connected yet. I can help refine your target role and search criteria.";
      },
    );
    const c = await service.create({ role: "talent", locale: "en" });
    const result = await service.respond({
      conversationId: c.id,
      message: "How do I find real projects?",
      locale: "en",
      requestId: randomUUID(),
    });
    assert.equal(latest, "How do I find real projects?");
    assert.match(
      result.conversation.messages.at(-1)!.text,
      /Live mission search is not connected/,
    );
    assert.doesNotMatch(
      result.conversation.messages.at(-1)!.text,
      /draft is ready|sheet is ready/i,
    );
  } finally {
    await pg.close();
  }
});
test("foreign and wrong-purpose attachments are rejected; quota and expiry enforced", async () => {
  const { pg, db } = await testStore();
  try {
    const owner = randomUUID(),
      service = new CopilotService(db, extractor, owner),
      c = await service.create({ role: "talent", locale: "en" });
    const id = randomUUID();
    await db.create(randomUUID(), "file", id, {
      text: "React developer",
      purpose: "profile",
    });
    await assert.rejects(
      () =>
        service.respond({
          conversationId: c.id,
          message: "Read CV",
          locale: "en",
          requestId: randomUUID(),
          attachmentIds: [id],
        }),
      /INVALID_FILE/,
    );
    await db.create(owner, "file", id, {
      text: "React developer",
      purpose: "mission",
    });
    await assert.rejects(
      () =>
        service.respond({
          conversationId: c.id,
          message: "Read CV",
          locale: "en",
          requestId: randomUUID(),
          attachmentIds: [id],
        }),
      /INVALID_FILE/,
    );
    const budgetOwner = randomUUID();
    for (let i = 0; i < 30; i++) await db.consume(budgetOwner);
    await assert.rejects(() => db.consume(budgetOwner), /RATE_LIMIT/);
    await pg.query(
      "update clynect_copilot_records set expires_at=now()-interval '1 day' where owner_id=$1",
      [owner],
    );
    assert.deepEqual(await service.list(), []);
    await pg.exec("select clynect_copilot_purge()");
    assert.equal(
      (
        await pg.query(
          "select * from clynect_copilot_records where owner_id=$1",
          [owner],
        )
      ).rows.length,
      0,
    );
  } finally {
    await pg.close();
  }
});
test("documents require correct format, bounded size and readable text", async () => {
  const doc = zipSync({
    "[Content_Types].xml": strToU8("<Types/>"),
    "word/document.xml": strToU8(
      "<w:document><w:p>React developer based in Paris with five years of experience.</w:p></w:document>",
    ),
  });
  assert.match(
    await extractDocument(doc, "cv.docx", "application/octet-stream"),
    /React developer/,
  );
  await assert.rejects(
    () =>
      extractDocument(
        new Uint8Array(4 * 1024 * 1024 + 1),
        "cv.pdf",
        "application/pdf",
      ),
    /FILE_TOO_LARGE/,
  );
  await assert.rejects(
    () => extractDocument(doc, "cv.pdf", "application/pdf"),
    /INVALID_FILE/,
  );
  const bad = zipSync({
    "[Content_Types].xml": strToU8("<Types/>"),
    "word/document.xml": strToU8("<w:document>short</w:document>"),
    "word/vbaProject.bin": new Uint8Array(3),
  });
  await assert.rejects(
    () => extractDocument(bad, "cv.docx", ""),
    /INVALID_FILE/,
  );
});
test("age and unsupported model assertions do not become professional facts", () => {
  const d = emptyDraft("profile", "en");
  assert.equal(
    fixtureChanges("I am 35 years old", d).some(
      (c) => c.field === "years_experience",
    ),
    false,
  );
  const result = applyChanges(
    d,
    [
      {
        field: "years_experience",
        value: "35",
        evidence: "35 years of experience",
        origin: "explicit",
      },
    ],
    "I am 35 years old",
  );
  assert.equal(result.fields.years_experience, undefined);
});

test('a real text PDF extracts successfully with the deployed PDF library',async()=>{
 const text='BT /F1 12 Tf 50 750 Td (React developer based in Paris with five years of experience.) Tj ET';
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${text.length} >>\nstream\n${text}\nendstream`];let pdf='%PDF-1.4\n';const offsets=[0];objects.forEach((o,i)=>{offsets.push(pdf.length);pdf+=`${i+1} 0 obj\n${o}\nendobj\n`;});const xref=pdf.length;pdf+=`xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n ').join('\n')}\ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
 assert.match(await extractDocument(new TextEncoder().encode(pdf),'test.pdf','application/pdf'),/React developer/);
});
