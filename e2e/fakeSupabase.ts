import type { Page, Route } from "@playwright/test";

/** Origin the app is built against for the e2e run (see playwright.config.ts). */
export const SUPABASE_ORIGIN = "https://e2e.supabase.test";

type Role = "accountant" | "client";
interface FakeUser {
  id: string;
  email: string;
  password: string;
  name: string;
  role: Role;
  company?: string;
  confirmed: boolean;
  accountStatus: "active" | "pending";
}

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
const fakeJwt = (u: FakeUser) =>
  `${b64({ alg: "none" })}.${b64({ sub: u.id, email: u.email, role: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600 })}.sig`;

/**
 * A tiny in-memory stand-in for the Supabase Auth and REST endpoints the sign-up and
 * sign-in screens use. It lets the browser flow run in CI without a database; the
 * database side (trigger, RLS, invitations) is covered by `npm run test:db`.
 * Email confirmation is on, as in production, until `confirm(email)` is called.
 */
export class FakeSupabase {
  users: FakeUser[] = [];
  signupCalls: Array<Record<string, unknown>> = [];

  confirm(email: string) {
    const u = this.users.find((x) => x.email === email);
    if (u) u.confirmed = true;
  }
  activate(email: string) {
    const u = this.users.find((x) => x.email === email);
    if (u) u.accountStatus = "active";
  }
  seed(u: Partial<FakeUser> & Pick<FakeUser, "email" | "password" | "role" | "name">) {
    this.users.push({ id: `uid-${this.users.length + 1}`, confirmed: true, accountStatus: "active", ...u });
  }

  private authUser(u: FakeUser) {
    return {
      id: u.id,
      aud: "authenticated",
      role: "authenticated",
      email: u.email,
      email_confirmed_at: u.confirmed ? new Date().toISOString() : null,
      app_metadata: { provider: "email" },
      user_metadata: { name: u.name, role: u.role, user_type: u.role, company: u.company },
      identities: [{ id: u.id, provider: "email" }],
      created_at: new Date().toISOString(),
    };
  }

  private session(u: FakeUser) {
    return {
      access_token: fakeJwt(u),
      token_type: "bearer",
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      refresh_token: `refresh-${u.id}`,
      user: this.authUser(u),
    };
  }

  private userFromRequest(route: Route): FakeUser | undefined {
    const auth = route.request().headers()["authorization"] ?? "";
    const token = auth.replace(/^Bearer\s+/i, "");
    const payload = token.split(".")[1];
    if (!payload) return undefined;
    try {
      const { sub } = JSON.parse(Buffer.from(payload, "base64url").toString());
      return this.users.find((x) => x.id === sub);
    } catch {
      return undefined;
    }
  }

  async install(page: Page) {
    await page.route(`${SUPABASE_ORIGIN}/**`, async (route) => {
      const req = route.request();
      const url = new URL(req.url());
      const json = (status: number, body: unknown) =>
        route.fulfill({
          status,
          contentType: "application/json",
          headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" },
          body: JSON.stringify(body),
        });

      if (req.method() === "OPTIONS") return json(200, {});

      // ---- Auth ----
      if (url.pathname === "/auth/v1/signup") {
        const body = req.postDataJSON() as { email: string; password: string; data?: Record<string, unknown> };
        this.signupCalls.push(body);
        if (this.users.some((u) => u.email === body.email)) {
          return json(422, { code: "user_already_exists", msg: "User already registered" });
        }
        const role = (body.data?.role as Role) ?? "client";
        const u: FakeUser = {
          id: `uid-${this.users.length + 1}`,
          email: body.email,
          password: body.password,
          name: String(body.data?.name ?? ""),
          role,
          company: body.data?.company as string | undefined,
          confirmed: false,
          // Matches the database: new accountants wait for an admin.
          accountStatus: role === "accountant" ? "pending" : "active",
        };
        this.users.push(u);
        return json(200, this.authUser(u)); // no session: email confirmation required
      }
      if (url.pathname === "/auth/v1/token") {
        const body = req.postDataJSON() as { email?: string; password?: string };
        const u = this.users.find((x) => x.email === body.email);
        if (!u || u.password !== body.password) {
          return json(400, { code: "invalid_credentials", error_code: "invalid_credentials", msg: "Invalid login credentials" });
        }
        if (!u.confirmed) {
          return json(400, { code: "email_not_confirmed", error_code: "email_not_confirmed", msg: "Email not confirmed" });
        }
        return json(200, this.session(u));
      }
      if (url.pathname === "/auth/v1/user") {
        const u = this.userFromRequest(route);
        return u ? json(200, this.authUser(u)) : json(401, { code: 401, msg: "invalid JWT" });
      }
      if (url.pathname === "/auth/v1/logout") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*" } });
      if (url.pathname.startsWith("/auth/v1/")) return json(200, {});

      // ---- REST ----
      const u = this.userFromRequest(route);
      // maybeSingle() reads a one-element array
      if (url.pathname === "/rest/v1/profiles" && u) {
        return json(200, [{
          user_id: u.id,
          name: u.name,
          email: u.email,
          company: u.company ?? null,
          user_type: u.role,
          account_status: u.accountStatus,
        }]);
      }
      if (url.pathname.startsWith("/rest/v1/rpc/")) return json(200, null);
      if (url.pathname.startsWith("/rest/v1/")) return json(200, []);
      return json(404, {});
    });
  }
}
