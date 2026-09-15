import { createClient, type SupabaseClient } from "@supabase/supabase-js";
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
    if (error) throw new AppError("STORAGE_UNAVAILABLE", 503);
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
    if (error) throw new AppError("STORAGE_UNAVAILABLE", 503);
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
    if (error) throw new AppError("STORAGE_UNAVAILABLE", 503);
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
    if (error) throw new AppError("STORAGE_UNAVAILABLE", 503);
    if (data !== true) throw new AppError("RATE_LIMIT", 429);
  }
}
export function storage(): Storage {
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
