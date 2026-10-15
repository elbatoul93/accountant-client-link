import { afterEach, describe, expect, it, vi } from "vitest";
import { isPasswordPwned } from "./pwnedPassword";

// SHA-1("password") = 5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8
const reply = (text: string, ok = true) => vi.fn().mockResolvedValue({ ok, text: async () => text });

describe("isPasswordPwned", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("flags a password whose suffix is listed and sends only the 5-char prefix", async () => {
    const f = reply("0018A45C4D1DEF81644B54AB7F969B88D65:1\r\n1E4C9B93F3F0682250B6CF8331B7EE68FD8:9545824\r\n");
    vi.stubGlobal("fetch", f);
    expect(await isPasswordPwned("password")).toBe(true);
    expect(f.mock.calls[0][0]).toBe("https://api.pwnedpasswords.com/range/5BAA6");
  });

  it("ignores padding rows with a zero count", async () => {
    vi.stubGlobal("fetch", reply("1E4C9B93F3F0682250B6CF8331B7EE68FD8:0\r\n"));
    expect(await isPasswordPwned("password")).toBe(false);
  });

  it("lets the password through when the API fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    expect(await isPasswordPwned("password")).toBe(false);
    vi.stubGlobal("fetch", reply("", false));
    expect(await isPasswordPwned("password")).toBe(false);
  });
});
