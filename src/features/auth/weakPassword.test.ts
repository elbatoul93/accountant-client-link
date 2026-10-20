import { describe, expect, it } from "vitest";
import { weakPasswordKey } from "@/features/auth/weakPassword";

describe("weakPasswordKey", () => {
  it("names the failed rule", () => {
    expect(weakPasswordKey({ reasons: ["length", "pwned"] })).toBe("auth_password_pwned");
    expect(weakPasswordKey({ reasons: ["characters"] })).toBe("auth_password_characters");
  });
  it("falls back to the generic message", () => {
    expect(weakPasswordKey({ reasons: ["length"] })).toBe("auth_reset_weak");
    expect(weakPasswordKey({})).toBe("auth_reset_weak");
    expect(weakPasswordKey({ reasons: "length" })).toBe("auth_reset_weak");
  });
});
