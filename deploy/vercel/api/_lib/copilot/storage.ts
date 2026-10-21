import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { AppError } from "./errors.js";
export type RecordValue = Record<string, unknown>;
export type Stored<T = RecordValue> = {
  id: string;
  kind: string;
  owner_id: string;
  data: T;
  version: number;
  expires_at: string;
  updated_at: string;
};
export interface Storage {
  get<T>(owner: string, kind: string, id: string): Promise<Stored<T> | null>;
  list<T>(owner: string, kind: string): Promise<Stored<T>[]>;
  create(owner: string, kind: string, id: string, data: unknown): Promise<void>;
  update(
    owner: string,
    kind: string,
    id: string,
    data: unknown,
    version: number,
  ): Promise<void>;
  save(
    owner: string,
    conversationId: string,
    revision: number,
    actionId: string,
    inputHash: string,
    payload: unknown,
  ): Promise<unknown>;
  consume(owner: string): Promise<void>;
}
export class NeonStorage implements Storage {
  constructor(private sql: NeonQueryFunction<false, false>) {}
  private failure(error: unknown): never {
    const value = error as { code?: string; message?: string };
    console.error("copilot_storage", {
      code: value.code,
      message: value.message,
      provider: "neon",
    });
    throw new AppError(
      value.code === "23505" ? "CONFLICT" : "STORAGE_UNAVAILABLE",
      value.code === "23505" ? 409 : 503,
    );
  }
  async get<T>(owner: string, kind: string, id: string) {
    try {
      const rows = await this.sql`
        select id, kind, owner_id, data, version, expires_at, updated_at
        from clynect_copilot_records
        where owner_id = ${owner}::uuid and kind = ${kind} and id = ${id}
          and expires_at > now()
        limit 1
      `;
      return (rows[0] as Stored<T> | undefined) ?? null;
    } catch (error) {
      return this.failure(error);
    }
  }
  async list<T>(owner: string, kind: string) {
    try {
      const rows = await this.sql`
        select id, kind, owner_id, data, version, expires_at, updated_at
        from clynect_copilot_records
        where owner_id = ${owner}::uuid and kind = ${kind}
          and expires_at > now()
        order by updated_at desc
        limit 50
      `;
      return rows as Stored<T>[];
    } catch (error) {
      return this.failure(error);
    }
  }
  async create(owner: string, kind: string, id: string, data: unknown) {
    const days = Math.min(
      7,
      Math.max(1, Number(process.env.COPILOT_RETENTION_DAYS) || 7),
    );
    try {
      await this.sql`
        insert into clynect_copilot_records
          (owner_id, kind, id, data, version, expires_at)
        values (
          ${owner}::uuid,
          ${kind},
          ${id},
          ${JSON.stringify(data)}::jsonb,
          0,
          now() + (${days} * interval '1 day')
        )
      `;
    } catch (error) {
      this.failure(error);
    }
  }
  async update(
    owner: string,
    kind: string,
    id: string,
    data: unknown,
    version: number,
  ) {
    try {
      const rows = await this.sql`
        update clynect_copilot_records
        set data = ${JSON.stringify(data)}::jsonb,
            version = version + 1,
            updated_at = now()
        where owner_id = ${owner}::uuid and kind = ${kind} and id = ${id}
          and version = ${version} and expires_at > now()
        returning id
      `;
      if (!rows.length) throw new AppError("CONFLICT", 409);
    } catch (error) {
      if (error instanceof AppError) throw error;
      this.failure(error);
    }
  }
  async save(
    owner: string,
    conversationId: string,
    revision: number,
    actionId: string,
    inputHash: string,
    payload: unknown,
  ) {
    try {
      const rows = await this.sql`
        select clynect_copilot_save_draft(
          ${owner}::uuid,
          ${conversationId},
          ${revision},
          ${actionId},
          ${inputHash},
          ${JSON.stringify(payload)}::jsonb
        ) as result
      `;
      return (rows[0] as { result: unknown }).result;
    } catch (error) {
      const message = (error as { message?: string }).message ?? "";
      const code = /IDEMPOTENCY_CONFLICT|CONFLICT|NOT_FOUND/.exec(message)?.[0];
      if (code) throw new AppError(code, 409);
      return this.failure(error);
    }
  }
  async consume(owner: string) {
    try {
      const rows = await this.sql`
        select clynect_copilot_consume(
          ${owner}::uuid,
          ${Math.min(100, Math.max(1, Number(process.env.COPILOT_HOURLY_LIMIT) || 30))},
          ${Math.min(1000, Math.max(1, Number(process.env.COPILOT_GLOBAL_HOURLY_LIMIT) || 100))}
        ) as allowed
      `;
      if ((rows[0] as { allowed?: boolean } | undefined)?.allowed !== true)
        throw new AppError("RATE_LIMIT", 429);
    } catch (error) {
      if (error instanceof AppError) throw error;
      this.failure(error);
    }
  }
}
export class SupabaseStorage implements Storage {
  constructor(private client: SupabaseClient) {}
  private table() {
    return this.client.from("clynect_copilot_records");
  }
  async get<T>(owner: string, kind: string, id: string) {
    const { data, error } = await this.table()
      .select("*")
      .eq("owner_id", owner)
      .eq("kind", kind)
      .eq("id", id)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    if (error) { console.error("copilot_storage", { code: error.code, message: error.message }); throw new AppError("STORAGE_UNAVAILABLE", 503); }
    return data as Stored<T> | null;
  }
  async list<T>(owner: string, kind: string) {
    const { data, error } = await this.table()
      .select("*")
      .eq("owner_id", owner)
      .eq("kind", kind)
      .gt("expires_at", new Date().toISOString())
      .order("updated_at", { ascending: false })
      .limit(50);
    if (error) { console.error("copilot_storage", { code: error.code, message: error.message }); throw new AppError("STORAGE_UNAVAILABLE", 503); }
    return (data ?? []) as Stored<T>[];
  }
  async create(owner: string, kind: string, id: string, data: unknown) {
    const days = Math.min(
      7,
      Math.max(1, Number(process.env.COPILOT_RETENTION_DAYS) || 7),
    );
    const { error } = await this.table().insert({
      owner_id: owner,
      kind,
      id,
      data,
      version: 0,
      expires_at: new Date(Date.now() + days * 86400000).toISOString(),
    });
    if (error)
      throw new AppError(
        error.code === "23505" ? "CONFLICT" : "STORAGE_UNAVAILABLE",
        error.code === "23505" ? 409 : 503,
      );
  }
  async update(
    owner: string,
    kind: string,
    id: string,
    data: unknown,
    version: number,
  ) {
    const { data: rows, error } = await this.table()
      .update({
        data,
        version: version + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("owner_id", owner)
      .eq("kind", kind)
      .eq("id", id)
      .eq("version", version)
      .gt("expires_at", new Date().toISOString())
      .select("id");
    if (error) { console.error("copilot_storage", { code: error.code, message: error.message }); throw new AppError("STORAGE_UNAVAILABLE", 503); }
    if (!rows?.length) throw new AppError("CONFLICT", 409);
  }
  async save(
    owner: string,
    conversationId: string,
    revision: number,
    actionId: string,
    inputHash: string,
    payload: unknown,
  ) {
    const { data, error } = await this.client.rpc(
      "clynect_copilot_save_draft",
      {
        p_owner: owner,
        p_conversation: conversationId,
        p_revision: revision,
        p_action: actionId,
        p_hash: inputHash,
        p_payload: payload,
      },
    );
    if (error) {
      const code = /IDEMPOTENCY_CONFLICT|CONFLICT|NOT_FOUND/.exec(
        error.message,
      )?.[0];
      throw new AppError(code ?? "STORAGE_UNAVAILABLE", code ? 409 : 503);
    }
    return data;
  }
  async consume(owner: string) {
    const { data, error } = await this.client.rpc("clynect_copilot_consume", {
      p_owner: owner,
      p_user_limit: Math.min(
        100,
        Math.max(1, Number(process.env.COPILOT_HOURLY_LIMIT) || 30),
      ),
      p_global_limit: Math.min(
        1000,
        Math.max(1, Number(process.env.COPILOT_GLOBAL_HOURLY_LIMIT) || 100),
      ),
    });
    if (error) { console.error("copilot_storage", { code: error.code, message: error.message }); throw new AppError("STORAGE_UNAVAILABLE", 503); }
    if (data !== true) throw new AppError("RATE_LIMIT", 429);
  }
}
export function storage(): Storage {
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl?.startsWith("postgres"))
    return new NeonStorage(neon(databaseUrl));
  const url = process.env.SUPABASE_URL,
    key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url?.startsWith("https://") || !key)
    throw new AppError("STORAGE_UNAVAILABLE", 503);
  return new SupabaseStorage(
    createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    }),
  );
}
