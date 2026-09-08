# Clynect Copilot

A runnable bilingual staging module for **mission brief → private mission draft** and **CV → private talent draft**, based on the 3 September 2026 specification. Includes a grounded staging knowledge layer, typed server tool boundary, consented uploads, editable review cards and a reusable V3 widget.

## Run locally

Requires Node.js 22.13+ (Node 24 recommended) and npm.

```sh
npm ci
cp .env.example .dev.vars
# For local private draft saves, set COPILOT_WRITE_TOOLS_ENABLED=true in .dev.vars.
npm run db:local
npm run dev
```

Open the URL printed by the development server. Its local D1 database lives under `.wrangler/state`. No real account or AI key is needed for fixture mode. Select recruiter or freelancer, try a fictional example or upload a fictional CV, edit the draft and save. The sign-in dialog activates an isolated demo session, not a Clynect account.

Do not use real CVs in this staging environment.

## Connect live AI

In the ignored `.dev.vars`, set:

```dotenv
COPILOT_PROVIDER=openai
OPENAI_API_KEY=your-server-side-key
OPENAI_MODEL=your-structured-output-capable-model
```

Restart the server after changing runtime variables. All provider calls run server-side. Without a configured provider, fixture mode uses a conservative deterministic extractor and is labeled as a demonstration. It is not equivalent to a production language model. The live provider path exists but has not been evaluated with an account credential in this workspace.

## Checks

```sh
npm test
npm run typecheck
npm run lint
# With the local server running:
TEST_BASE_URL=http://localhost:3001 npm run test:integration
TEST_BASE_URL=http://localhost:3001 node tests/browser.mjs
npm run build
```

The browser harness uses an isolated headless Chrome installation. Set `PLAYWRIGHT_CHANNEL` if necessary. Screenshots and machine-readable browser reports go to ignored `outputs/`.

The 40-scenario fixture corpus covers 20 French, 10 English and 10 adversarial examples. These checks do not establish the specification's live model accuracy targets. See [evaluation status](docs/EVALUATION.md).

## Architecture

- `src/features/copilot/`: bilingual interface, draft contracts, field validation, review card and lazy embeddable widget.
- `server/copilot/`: session policy, extraction provider, knowledge, document parser, adapters and audit support.
- `app/api/copilot/[...path]/route.ts`: same-origin HTTP endpoints and SSE orchestration.
- `db/` and `drizzle/`: server persistence and generated schema migration.
- `tests/`: controlled evaluations, security/unit checks, HTTP journey tests and browser checks.

The scaffold uses React, TypeScript, Vinext and Cloudflare D1. It keeps the feature and service contracts portable so V3 can replace the runtime adapters without duplicating Clynect's accounts or domain database.

## Scope and integration

See [V3 integration contracts](docs/INTEGRATION.md) for auth, endpoints, security and runtime variables.

Implemented staging capabilities: two intake journeys, PDF/DOCX extraction, editable private drafts, French/English copy, grounded source labels, server session isolation, consented support-request previews, request/write idempotency, error recovery and tests.

Not connected: real Clynect authentication, active pricing/entitlements, matching, support delivery or production persistence. Publishing, applications, introductions, payments and identity revelation are disabled/deferred. Saved staging support requests are explicitly not sent.

Production rollout requires approved knowledge/legal copy, retention and deletion integration, deployment-specific security review and live model evaluations. No production deployment was performed, as required by the specification. The local preview is the current deliverable.

## Provider reference

The extraction transport follows the official [Structured Outputs guide](https://developers.openai.com/api/docs/guides/structured-outputs). API keys and source documents are never committed.
