import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { type Storage, type Stored } from "../api/_lib/copilot/storage.js";
import { AppError } from "../api/_lib/copilot/errors.js";
export async function testStore() {
  const pg = new PGlite();
  await pg.exec(
    "create role anon; create role authenticated; create role service_role;",
  );
  await pg.exec(
    await readFile(new URL("../supabase/copilot.sql", import.meta.url), "utf8"),
  );
  const db: Storage = {
    async get<T>(owner: string, kind: string, id: string) {
      return (
        (
          await pg.query<Stored<T>>(
            "select * from clynect_copilot_records where owner_id=$1 and kind=$2 and id=$3 and expires_at>now()",
            [owner, kind, id],
          )
        ).rows[0] ?? null
      );
    },
    async list<T>(owner: string, kind: string) {
      return (
        await pg.query<Stored<T>>(
          "select * from clynect_copilot_records where owner_id=$1 and kind=$2 and expires_at>now() order by updated_at desc",
          [owner, kind],
        )
      ).rows;
    },
    async create(owner, kind, id, data) {
      try {
        await pg.query(
          "insert into clynect_copilot_records(owner_id,kind,id,data) values($1,$2,$3,$4)",
          [owner, kind, id, JSON.stringify(data)],
        );
      } catch {
        throw new AppError("CONFLICT", 409);
      }
    },
    async update(owner, kind, id, data, version) {
      const r = await pg.query(
        "update clynect_copilot_records set data=$4,version=version+1,updated_at=now() where owner_id=$1 and kind=$2 and id=$3 and version=$5 and expires_at>now() returning id",
        [owner, kind, id, JSON.stringify(data), version],
      );
      if (!r.rows.length) throw new AppError("CONFLICT", 409);
    },
    async consume(owner) {
      const r = await pg.query<{ ok: boolean }>(
        "select clynect_copilot_consume($1,30,100) as ok",
        [owner],
      );
      if (!r.rows[0].ok) throw new AppError("RATE_LIMIT", 429);
    },
    async save(owner, conversationId, revision, actionId, inputHash, payload) {
      const r = await pg.query<{ result: unknown }>(
        "select clynect_copilot_save_draft($1,$2,$3,$4,$5,$6) as result",
        [
          owner,
          conversationId,
          revision,
          actionId,
          inputHash,
          JSON.stringify(payload),
        ],
      );
      return r.rows[0].result;
    },
  };
  return { pg, db };
}
