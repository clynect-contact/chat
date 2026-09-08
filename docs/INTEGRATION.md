# Clynect V3 integration

This is a standalone staging implementation of the two intake journeys. It does not replace Clynect authentication, users, missions, profiles, subscriptions or matching. No production deployment has been performed.

## Frontend boundary

`src/features/copilot/index.tsx` exports `CopilotWidget({enabled, locale})`. Mount it once and include the shared stylesheet. It lazy-loads a 480px desktop sheet and a full-screen mobile sheet. The standalone `/` page exposes the same workflows with an adjacent review panel. The host can port the feature directory and shared contracts to its React application. This starter uses Vinext (Next-compatible React routes) with a Cloudflare D1 persistence adapter; a standard Next.js or Laravel host should replace the runtime persistence adapter, not create a second identity layer.

The interface supports French and English, streaming progress/text events, uploads with consent, structured edits, private saves, and support-request previews. Browser storage holds only language preference. Conversations and working drafts are stored on the server.

## Auth contract

In production mode, the server calls `POST` tool endpoints below and `GET /copilot/context` on `CLYNECT_API_BASE_URL`. Context receives the original request cookie in `x-clynect-session` and the server credential in `Authorization`. The host must validate that session and return:

```json
{
  "id": "authenticated-user-id",
  "tenant": "company-id",
  "authenticated": true,
  "role": "business",
  "roles": ["business", "talent"],
  "capabilities": ["save_mission_draft", "get_current_pricing"],
  "locale": "fr",
  "displayName": "Claire"
}
```

Identity values are never accepted from model output. The context service must enforce the selected active role. Production role switching and login must be implemented by the host; the demo-session endpoint is disabled outside staging.

Missing auth configuration fails closed. Never deploy `COPILOT_MODE=staging` against real Clynect data: staging intentionally lets a visitor activate a fictional identity isolated to their random session.

## Tool adapter contract

`server/copilot/adapters.ts` owns all external calls. Requests contain `{actor:{id,tenant,role},input}`. The authenticated backend must independently enforce company ownership, plan rights, visibility, blocked companies, and consent.

- `POST /copilot/drafts`: canonical mission/profile payload; requires `Idempotency-Key`. Return `{id,url:"/relative/object/path",private:true}`. Ownership and draft status cannot be supplied by the model. Concurrent/retried requests must return the same object.
- `POST /copilot/pricing`: input `{locale}`. Return `{text,source:{id,title,version,content,approved:true}}`. The text must include active pricing context, currency and tax details from approved runtime configuration. No pricing is shipped as a prompt constant.
- `POST /copilot/support`: input `{id,locale,turns,objectId}`, at most five consented turns. Return `{id,status:"created"}`. Use the supplied idempotency key.
- Production matching intentionally fails closed pending a verified, privacy-filtered matching response contract. Do not return raw CV library records. Secret profiles and blocked companies require filtering before any existence clue reaches the Copilot.

`canonicalDraft()` maps the editable working draft into the production payload. Unknown fields remain missing, and extraction evidence is retained. Some complex fields (projects, locations, language proficiency and skill levels) are deliberately conservative: descriptive text is retained and unverified subfields are null. Final typed domain mappings must be reconciled with the actual V3 API schema.

## Local HTTP and SSE contracts

- `GET /api/copilot/session`: bootstrap a random HttpOnly SameSite session; expose only display context.
- `GET/POST /api/copilot/conversations`: list/create owned conversations.
- `POST /api/copilot/respond`: `{conversationId,message,locale,attachmentIds,requestId}`. Responses stream `tool.pending`, `message.delta`, `source`, `draft.updated`, `done`, `error`. An already completed request returns its persisted conversation as JSON.
- `POST /api/copilot/files`: multipart `file`, `purpose=mission|profile`, `consent=true`. Returns an owned attachment reference. PDF/DOCX only, capped at 10 MB, 80 PDF pages, 60,000 extracted characters; DOCX decompression is bounded. Raw uploaded bytes are not retained. Scanned and encrypted PDFs are rejected with recovery guidance.
- `POST /api/copilot/edit`: `{conversationId,revision,field,value}`. Server validates allowed fields, types and revision.
- `POST /api/copilot/actions`: schema-defined tool/action id, conversation, current draft revision and relevant confirmation/consent. Private saves require the Save button; no language-model action directly writes.
- `GET /api/copilot/drafts`: current user's saved drafts.
- `POST /api/copilot/feedback`: owned message reference and helpfulness.

All mutations require same-origin requests. D1 queries bind parameters and scope rows by owner and tenant. Optimistic conversation versions protect concurrent updates. Tool and request IDs are hashed against inputs; reuse with different inputs is rejected. External implementations must preserve idempotency beyond this local adapter.

## Model and knowledge configuration

Set `COPILOT_PROVIDER=openai`, `OPENAI_API_KEY`, and `OPENAI_MODEL` as server secrets/runtime variables. Never prefix these with `NEXT_PUBLIC_` or `VITE_`. The model must support Responses API structured outputs. The implementation uses `store:false`; this is not a promise of zero provider retention. Review the actual account agreement/settings before using real CVs.

The model proposes field changes only. The orchestrator validates proposals, requires verbatim source spans, preserves private state, asks one missing-field question, and executes only application-controlled tools. The prompt is versioned in `provider.ts`. It does not contain prices, credentials or permissions. SSE progress begins before extraction; validated prose is emitted after structured extraction, without fabricated typing delays.

`knowledge.ts` is a small versioned, bilingual staging source derived from the specification. It is not approved legal/product copy. Replace it with approved retrieval and add a production approval gate before enabling it for end users. The pricing adapter hands off when no authoritative runtime source is connected. Arbitrary URLs, web scraping and shared private-profile vector indexes are not supported.

## Privacy and operations

Use fictional documents in staging. Extracted file text has a configurable expiry (seven days in the local demo); expired references are rejected and purged on later uploads. A scheduled production cleanup job and approved retention policy are still required. Conversation/draft retention and account deletion/export must integrate with Clynect's lifecycle. Do not treat the limited conversation-delete endpoint as account erasure.

Telemetry stores identifiers, event category, extraction timing/token counts and result metadata, not raw prompts or CV content. Conversation content and tool results are application data and need normal access, retention, encryption and deletion controls. No antivirus infrastructure is provided. No claim of legal compliance is made.

Per-user/global hourly request caps bound model usage. Provider timeouts fail without automatically retrying a write. Production per-token monetary budgets, circuit breaking, operational alerts and the full retention scheduler remain integration tasks.

The optional WebMCP `stage_copilot_message` tool only fills the visible composer for review. It does not send or save. Browsers without the proposed API behave normally.
