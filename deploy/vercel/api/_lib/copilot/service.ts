import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import {
  actionSchema,
  respondSchema,
  roleSchema,
  localeSchema,
  emptyDraft,
  applyChanges,
  canonicalDraft,
  completeDraft,
  parseField,
  fieldSchema,
  fieldDefinitions,
  missionFields,
  profileFields,
  type Conversation,
  type Session,
} from "./contracts.js";
import { AppError, assert } from "./errors.js";
import { type Storage } from "./storage.js";
import { type Extractor, providerMode } from "./provider.js";
import { isKnowledgeQuestion, retrieve } from "./knowledge.js";
const hash = (x: unknown) =>
  createHash("sha256").update(JSON.stringify(x)).digest("hex");
const now = () => new Date().toISOString();
export class CopilotService {
  constructor(
    private db: Storage,
    private extractor: Extractor,
    private owner: string,
  ) {}
  async session(input?: unknown): Promise<Session> {
    const row = await this.db.get<{
      role: Session["role"];
      locale: Session["locale"];
    }>(this.owner, "session", "current");
    let data = row?.data ?? {
      role: "anonymous" as const,
      locale: "fr" as const,
    };
    if (input) {
      data = z
        .object({
          role: roleSchema,
          locale: localeSchema,
          signIn: z.boolean().optional(),
        })
        .parse(input);
      if (row)
        await this.db.update(
          this.owner,
          "session",
          "current",
          data,
          row.version,
        );
      else await this.db.create(this.owner, "session", "current", data);
    }
    return {
      ...data,
      authenticated: true,
      roles: ["anonymous", "business", "talent", "project"],
      provider: providerMode(),
      mode: "staging",
      capabilities: ["save_mission_draft", "save_profile_draft"],
      displayName: "Clynect Chat · session privée",
      copilotName: "Cly",
    };
  }
  async conversation(id: string) {
    const row = await this.db.get<Conversation>(this.owner, "conversation", id);
    assert(row, "NOT_FOUND", 404);
    return row;
  }
  async list() {
    return (await this.db.list<Conversation>(this.owner, "conversation")).map(
      (r) => ({
        ...r.data,
        messages: [],
        draft: r.data.draft
          ? { ...r.data.draft, fields: {}, evidence: [] }
          : null,
      }),
    );
  }
  async create(input: unknown) {
    const { role, locale } = z
      .object({ role: roleSchema, locale: localeSchema })
      .strict()
      .parse(input);
    const c: Conversation = {
      id: randomUUID(),
      role,
      locale,
      title: role === "talent" ? "Mon profil" : "Nouvelle conversation",
      messages: [],
      draft:
        role === "anonymous"
          ? null
          : emptyDraft(role === "talent" ? "profile" : "mission", locale),
      version: 0,
      updatedAt: now(),
    };
    await this.db.create(this.owner, "conversation", c.id, c);
    return c;
  }
  async respond(input: unknown) {
    const req = respondSchema.parse(input);
    let row = await this.conversation(req.conversationId);
    const key = hash(req);
    let request = await this.db.get<{
      hash: string;
      status: string;
      result?: Conversation;
    }>(this.owner, "request", req.requestId);
    if (request) {
      assert(request.data.hash === key, "IDEMPOTENCY_CONFLICT", 409);
      if (request.data.status === "done")
        return { conversation: request.data.result! };
      assert(
        request.data.status === "failed" ||
          Date.now() - Date.parse(request.updated_at) > 90000,
        "CONFLICT",
        409,
      );
      await this.db.update(
        this.owner,
        "request",
        req.requestId,
        { hash: key, status: "pending" },
        request.version,
      );
    } else
      await this.db.create(this.owner, "request", req.requestId, {
        hash: key,
        status: "pending",
      });
    try {
      await this.db.consume(this.owner);
      let c = structuredClone(row.data);
      const replyId =
        hash(req.requestId).slice(0, 8) +
        "-" +
        hash(req.requestId).slice(8, 12) +
        "-4" +
        hash(req.requestId).slice(13, 16) +
        "-a" +
        hash(req.requestId).slice(17, 20) +
        "-" +
        hash(req.requestId).slice(20, 32);
      if (c.messages.some((m) => m.id === replyId)) {
        request = await this.db.get(this.owner, "request", req.requestId);
        await this.db.update(
          this.owner,
          "request",
          req.requestId,
          { hash: key, status: "done", result: c },
          request!.version,
        );
        return { conversation: c };
      }
      assert(c.messages.length < 100, "CONVERSATION_LIMIT", 400);
      assert(
        c.messages.reduce((n, m) => n + m.text.length, 0) + req.message.length <
          120000,
        "CONVERSATION_LIMIT",
      );
      let text = req.message;
      for (const id of req.attachmentIds) {
        const file = await this.db.get<{ text: string; purpose: string }>(
          this.owner,
          "file",
          id,
        );
        assert(
          file && file.data.purpose === c.draft?.kind,
          "INVALID_FILE",
          400,
        );
        text += "\n" + file.data.text;
      }
      assert(text.length <= 180000, "DOCUMENT_TOO_LONG");
      if (!c.messages.some((m) => m.id === req.requestId)) {
        c.messages.push({
          id: req.requestId,
          role: "user",
          text: req.message,
          createdAt: now(),
        });
        c.title = req.message.slice(0, 70);
        c.updatedAt = now();
        c.version++;
        await this.db.update(this.owner, "conversation", c.id, c, row.version);
        row = await this.conversation(c.id);
        c = structuredClone(row.data);
      }
      let reply: string;
      let sources: ReturnType<typeof retrieve> | undefined;
      const fr = req.locale === "fr";
      if (
        /(?:only|only hire|uniquement|seulement).{0,30}(?:hommes|femmes|men|women|blancs|white)|(?:under|moins de)\s*\d+\s*(?:years old|ans)/i.test(
          text,
        )
      )
        reply = fr
          ? "Je peux structurer des critères professionnels liés à la mission, sans critères discriminatoires."
          : "I can structure job-related professional requirements without discriminatory criteria.";
      else if (isKnowledgeQuestion(req.message)) {
        if (/tarif|prix|pricing|price|commission|abonnement/i.test(req.message))
          reply = fr
            ? "Je ne dispose pas de tarifs approuvés. Contactez l’équipe Clynect pour les confirmer."
            : "I do not have approved pricing. Contact the Clynect team to confirm it.";
        else {
          sources = retrieve(req.message, req.locale);
          reply = sources.map((s) => s.content).join("\n\n");
        }
      } else if (c.draft) {
        c.draft = applyChanges(
          c.draft,
          await this.extractor(text, c.draft),
          text,
          req.attachmentIds.length ? "document" : "message",
        );
        const missing = c.draft.missing_fields
          .slice(0, 2)
          .map((f) => fieldDefinitions[f][fr ? 0 : 1])
          .join(", ");
        reply = fr
          ? `Votre fiche est prête à relire.${missing ? " Pouvez-vous préciser : " + missing + " ?" : " Vérifiez les champs puis enregistrez la fiche privée."}`
          : `Your draft is ready to review.${missing ? " Please clarify: " + missing + "?" : " Review the fields and save your private draft."}`;
      } else
        reply = fr
          ? "Choisissez « Mission » ou « Profil » pour préparer une fiche. Je peux aussi expliquer Clynect à partir de la spécification disponible."
          : "Choose Mission or Profile to prepare a draft. I can also explain Clynect using the available specification.";
      c.locale = req.locale;
      c.messages.push({
        id: replyId,
        role: "assistant",
        text: reply,
        ...(sources ? { sources } : {}),
        createdAt: now(),
      });
      c.updatedAt = now();
      c.version++;
      await this.db.update(this.owner, "conversation", c.id, c, row.version);
      request = await this.db.get(this.owner, "request", req.requestId);
      await this.db.update(
        this.owner,
        "request",
        req.requestId,
        { hash: key, status: "done", result: c },
        request!.version,
      );
      return { conversation: c };
    } catch (error) {
      request = await this.db.get(this.owner, "request", req.requestId);
      if (request?.data.status === "pending")
        await this.db.update(
          this.owner,
          "request",
          req.requestId,
          { hash: key, status: "failed" },
          request.version,
        );
      throw error;
    }
  }
  async edit(input: unknown) {
    const req = z
      .object({
        conversationId: z.uuid(),
        revision: z.number().int().min(0),
        field: fieldSchema,
        value: z.string().max(6000),
      })
      .strict()
      .parse(input);
    const row = await this.conversation(req.conversationId),
      c = structuredClone(row.data);
    assert(c.draft && c.draft.revision === req.revision, "CONFLICT", 409);
    assert(
      (c.draft.kind === "mission" ? missionFields : profileFields).includes(
        req.field,
      ),
      "INVALID_FIELD",
    );
    try {
      c.draft.fields[req.field] = parseField(req.field, req.value);
    } catch {
      throw new AppError("INVALID_FIELD");
    }
    c.draft.evidence = c.draft.evidence.filter((e) => e.field !== req.field);
    c.draft.evidence.push({
      field: req.field,
      quote: req.value,
      source: "editor",
      origin: "user",
    });
    c.draft.unsupported_fields = c.draft.unsupported_fields.filter(
      (f) => f !== req.field,
    );
    c.draft.suggestions_to_confirm = c.draft.suggestions_to_confirm.filter(
      (f) => f !== req.field,
    );
    c.draft.revision++;
    c.draft = completeDraft(c.draft);
    c.version++;
    c.updatedAt = now();
    await this.db.update(this.owner, "conversation", c.id, c, row.version);
    return c;
  }
  async action(input: unknown) {
    const req = actionSchema.parse(input),
      row = await this.conversation(req.conversationId),
      c = row.data;
    if (!req.tool.startsWith("save_"))
      throw new AppError("TOOL_UNAVAILABLE", 503);
    assert(
      process.env.COPILOT_WRITES_ENABLED === "true",
      "WRITES_DISABLED",
      503,
    );
    assert(c.draft, "INVALID_DRAFT");
    assert(
      (req.tool === "save_profile_draft" &&
        c.role === "talent" &&
        c.draft.kind === "profile") ||
        (req.tool === "save_mission_draft" &&
          ["business", "project"].includes(c.role) &&
          c.draft.kind === "mission"),
      "FORBIDDEN",
      403,
    );
    assert(!c.draft.conflicts.length, "DRAFT_CONFLICTS", 409);
    return this.db.save(
      this.owner,
      c.id,
      req.revision,
      req.actionId,
      hash(req),
      canonicalDraft(c.draft),
    );
  }
  async drafts() {
    return (
      await this.db.list<{
        kind: string;
        body: { title?: string; headline?: string };
      }>(this.owner, "draft")
    ).map((r) => ({
      id: r.id,
      kind: r.data.kind,
      body: JSON.stringify({
        title: r.data.body.title,
        headline: r.data.body.headline,
      }),
      updated_at: r.updated_at,
    }));
  }
  async feedback(input: unknown) {
    const req = z
      .object({
        conversationId: z.uuid(),
        messageId: z.uuid(),
        helpful: z.boolean(),
      })
      .strict()
      .parse(input);
    const c = await this.conversation(req.conversationId);
    assert(
      c.data.messages.some(
        (m) => m.id === req.messageId && m.role === "assistant",
      ),
      "NOT_FOUND",
      404,
    );
    await this.db.create(this.owner, "feedback", randomUUID(), req);
    return { ok: true };
  }
}
