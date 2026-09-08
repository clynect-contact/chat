import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
export const sessions = sqliteTable('copilot_sessions', {
  id: text().primaryKey(),
  authenticated: integer().notNull().default(0),
  role: text().notNull().default('anonymous'),
  locale: text().notNull().default('fr'),
  expiresAt: integer('expires_at').notNull(),
});
export const conversations = sqliteTable(
  'copilot_conversations',
  {
    id: text().primaryKey(),
    owner: text().notNull(),
    tenant: text().notNull(),
    role: text().notNull(),
    body: text().notNull(),
    version: integer().notNull().default(0),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [index('idx_conversation_owner').on(t.owner, t.tenant)],
);
export const files = sqliteTable(
  'copilot_files',
  {
    id: text().primaryKey(),
    owner: text().notNull(),
    tenant: text().notNull(),
    purpose: text().notNull(),
    name: text().notNull(),
    contentType: text('content_type').notNull(),
    size: integer().notNull(),
    extractedText: text('extracted_text').notNull(),
    createdAt: text('created_at').notNull(),
    expiresAt: integer('expires_at').notNull(),
  },
  (t) => [index('idx_file_owner').on(t.owner, t.tenant)],
);
export const drafts = sqliteTable(
  'copilot_drafts',
  {
    id: text().primaryKey(),
    owner: text().notNull(),
    tenant: text().notNull(),
    kind: text().notNull(),
    body: text().notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [index('idx_draft_owner').on(t.owner, t.tenant)],
);
export const tools = sqliteTable(
  'copilot_tool_runs',
  {
    id: text().primaryKey(),
    owner: text().notNull(),
    tool: text().notNull(),
    inputHash: text('input_hash').notNull(),
    status: text().notNull(),
    result: text(),
    createdAt: text('created_at').notNull(),
  },
  (t) => [index('idx_tool_owner').on(t.owner)],
);
export const events = sqliteTable(
  'copilot_events',
  {
    id: text().primaryKey(),
    owner: text().notNull(),
    event: text().notNull(),
    metadata: text().notNull(),
    createdAt: text('created_at').notNull(),
  },
  (t) => [index('idx_event_owner_date').on(t.owner, t.createdAt)],
);
export const consents = sqliteTable('copilot_consents', {
  id: text().primaryKey(),
  owner: text().notNull(),
  purpose: text().notNull(),
  objectId: text('object_id').notNull(),
  createdAt: text('created_at').notNull(),
});
export const handoffs = sqliteTable('copilot_handoffs', {
  id: text().primaryKey(),
  owner: text().notNull(),
  body: text().notNull(),
  createdAt: text('created_at').notNull(),
});
export const requests = sqliteTable(
  'copilot_requests',
  {
    id: text().primaryKey(),
    owner: text().notNull(),
    conversationId: text('conversation_id').notNull(),
    inputHash: text('input_hash').notNull(),
    status: text().notNull(),
    createdAt: text('created_at').notNull(),
  },
  (t) => [index('idx_request_owner_date').on(t.owner, t.createdAt)],
);
