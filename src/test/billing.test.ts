import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const rpc = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));

import { daysLeft, billingRpc } from "@/features/billing/billing";
import { useSubscription } from "@/features/billing/useSubscription";

beforeEach(() => rpc.mockReset());

describe("daysLeft", () => {
  const now = Date.parse("2026-10-15T12:00:00Z");
  it("is null without a date", () => expect(daysLeft(null, now)).toBeNull());
  it("rounds a partial day up", () => expect(daysLeft("2026-10-16T00:00:00Z", now)).toBe(1));
  it("counts whole days", () => expect(daysLeft("2026-10-25T12:00:00Z", now)).toBe(10));
  it("goes negative once past", () => expect(daysLeft("2026-10-10T12:00:00Z", now)).toBe(-5));
});

describe("billingRpc", () => {
  it("calls supabase.rpc with the function name and args", async () => {
    rpc.mockResolvedValueOnce({ data: 1, error: null });
    await billingRpc("admin_void_receipt", { _receipt_id: "r1", _reason: "dup" });
    expect(rpc).toHaveBeenCalledWith("admin_void_receipt", { _receipt_id: "r1", _reason: "dup" });
  });
});

describe("useSubscription", () => {
  const row = { plan: "standard", state: "grace", trial_ends_at: null, paid_until: "2026-10-01T00:00:00Z", grace_days: 7, ends_at: null };
  it("returns the row (array result)", async () => {
    rpc.mockResolvedValueOnce({ data: [row], error: null });
    const { result } = renderHook(() => useSubscription());
    await waitFor(() => expect(result.current).toEqual(row));
    expect(rpc).toHaveBeenCalledWith("my_subscription", undefined);
  });
  it("accepts a single object result", async () => {
    rpc.mockResolvedValueOnce({ data: row, error: null });
    const { result } = renderHook(() => useSubscription());
    await waitFor(() => expect(result.current?.state).toBe("grace"));
  });
  it("stays null (no restriction) on an error", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: "function does not exist" } });
    const { result } = renderHook(() => useSubscription());
    await new Promise((r) => setTimeout(r, 10));
    expect(result.current).toBeNull();
  });
  it("stays null for an empty result", async () => {
    rpc.mockResolvedValueOnce({ data: [], error: null });
    const { result } = renderHook(() => useSubscription());
    await new Promise((r) => setTimeout(r, 10));
    expect(result.current).toBeNull();
  });
});
