import { describe, it, expect, vi, beforeEach } from "vitest";

// A chainable, awaitable stand-in for a supabase query builder that records every call.
const calls: Array<{ table: string; op: string; args: unknown[]; filters: unknown[][] }> = [];
let nextError: { message: string } | null = null;
const builder = (table: string, op: string, args: unknown[]) => {
  const rec = { table, op, args, filters: [] as unknown[][] };
  calls.push(rec);
  const b: Record<string, unknown> = {};
  for (const f of ["eq", "in", "is", "select", "order"]) b[f] = (...a: unknown[]) => { rec.filters.push([f, ...a]); return b; };
  b.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: [], error: nextError }).then(res);
  return b;
};
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => ({
      upsert: (...a: unknown[]) => builder(table, "upsert", a),
      insert: (...a: unknown[]) => builder(table, "insert", a),
      delete: (...a: unknown[]) => builder(table, "delete", a),
      select: (...a: unknown[]) => builder(table, "select", a),
    }),
  },
}));

import { toUuid, syncClients, syncLocks, loadClients, type ClientRecord } from "@/features/accountant/lib/businessStore";

const client = (id: string, over: Partial<ClientRecord> = {}): ClientRecord =>
  ({ id, name: `N${id}`, taxId: "123", contact: "c@x.dz", status: "active", ...over });

beforeEach(() => { calls.length = 0; nextError = null; });

describe("toUuid", () => {
  it("keeps real uuids and re-keys legacy ids", () => {
    const u = "123e4567-e89b-42d3-a456-426614174000";
    expect(toUuid(u)).toBe(u);
    expect(toUuid("c_17000")).not.toBe("c_17000");
    expect(toUuid("c_17000")).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe("syncClients", () => {
  it("writes nothing when nothing changed", async () => {
    await syncClients([client("a")], [client("a")], "acc");
    expect(calls).toHaveLength(0);
  });
  it("upserts only new or changed clients and deletes removed ones, scoped to the accountant", async () => {
    await syncClients([client("a"), client("b"), client("c")], [client("a"), client("b", { name: "Renamed" }), client("d")], "acc");
    const up = calls.find((c) => c.op === "upsert")!;
    const rows = up.args[0] as Array<{ client_ref: string; accountant_id: string }>;
    expect(rows.map((r) => r.client_ref)).toEqual(["b", "d"]);
    expect(rows.every((r) => r.accountant_id === "acc")).toBe(true);
    expect(up.args[1]).toEqual({ onConflict: "accountant_id,client_ref" });
    const del = calls.find((c) => c.op === "delete")!;
    expect(del.filters).toEqual(expect.arrayContaining([["eq", "accountant_id", "acc"], ["in", "client_ref", ["c"]]]));
  });
  it("keeps extra client fields in the data column as snake_case", async () => {
    await syncClients([], [client("a", { activityCode: "47.11" })], "acc");
    const row = (calls[0].args[0] as Array<{ data: Record<string, unknown> }>)[0];
    expect(row.data).toEqual({ activity_code: "47.11" });
  });
  it("falls back to contact for the email and throws when the write fails", async () => {
    nextError = { message: "denied" };
    await expect(syncClients([], [client("a")], "acc")).rejects.toThrow("denied");
    expect((calls[0].args[0] as Array<{ email: string }>)[0].email).toBe("c@x.dz");
  });
});

describe("syncLocks", () => {
  const lock = (period: string, clientId?: string) => ({ key: `${clientId ?? "_"}__${period}`, clientId, period, validatedAt: "2026-02-01", reference: "" });
  it("inserts new locks and deletes removed ones by period and client", async () => {
    await syncLocks([lock("2026-01", "c1"), lock("2026-02")], [lock("2026-01", "c1"), lock("2026-03", "c1")], "acc");
    const ins = calls.find((c) => c.op === "insert")!;
    expect((ins.args[0] as Array<{ period: string }>).map((r) => r.period)).toEqual(["2026-03"]);
    const del = calls.find((c) => c.op === "delete")!;
    expect(del.filters).toEqual(expect.arrayContaining([["eq", "period", "2026-02"], ["is", "client_ref", null]]));
  });
  it("surfaces a failed delete", async () => {
    nextError = { message: "locked" };
    await expect(syncLocks([lock("2026-01")], [], "acc")).rejects.toThrow("locked");
  });
});

describe("loadClients", () => {
  it("throws on a database error", async () => {
    nextError = { message: "boom" };
    await expect(loadClients("acc")).rejects.toThrow("boom");
  });
});
