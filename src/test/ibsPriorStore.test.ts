import { describe, it, expect, vi } from "vitest";

const maybeSingle = vi.fn();
const upsert = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle }) }) }), upsert }),
    auth: { getUser: async () => ({ data: { user: { id: "acc-1" } } }) },
  },
}));

import { loadIbsPrior, saveIbsPrior } from "@/features/accountant/lib/ibsPriorStore";

describe("IBS N-1 store", () => {
  it("returns the saved amount", async () => {
    maybeSingle.mockResolvedValueOnce({ data: { amount: "1250000" }, error: null });
    expect(await loadIbsPrior("cl-1", 2026)).toBe(1_250_000);
  });
  it("returns null when nothing is saved or the table is not live yet", async () => {
    maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    expect(await loadIbsPrior("cl-1", 2026)).toBeNull();
    maybeSingle.mockResolvedValueOnce({ data: null, error: { message: "relation does not exist" } });
    expect(await loadIbsPrior("cl-1", 2026)).toBeNull();
    maybeSingle.mockRejectedValueOnce(new Error("network"));
    expect(await loadIbsPrior("cl-1", 2026)).toBeNull();
  });
  it("saves under the signed-in accountant and reports failure without throwing", async () => {
    upsert.mockResolvedValueOnce({ error: null });
    expect(await saveIbsPrior("cl-1", 2026, 900_000)).toBe(true);
    expect(upsert).toHaveBeenLastCalledWith({ accountant_id: "acc-1", client_ref: "cl-1", year: 2026, amount: 900_000 });
    upsert.mockResolvedValueOnce({ error: { message: "relation does not exist" } });
    expect(await saveIbsPrior("cl-1", 2026, 900_000)).toBe(false);
  });
  it("does not save without a client or with a bad amount", async () => {
    expect(await saveIbsPrior("", 2026, 10)).toBe(false);
    expect(await saveIbsPrior("cl-1", 2026, -1)).toBe(false);
  });
});
