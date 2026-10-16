import { randomUUID } from "node:crypto";
import type { Page, Route } from "@playwright/test";

/** Origin the app is built against for the e2e run (see playwright.config.ts). */
export const SUPABASE_ORIGIN = "https://e2e.supabase.test";

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

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
  linkedAccountantId?: string;
}

/** Compares as numbers when both sides are numeric, otherwise as strings (ISO dates sort correctly). */
const cmp = (a: unknown, b: string) => {
  const x = Number(a), y = Number(b);
  if (a !== "" && a != null && b !== "" && !Number.isNaN(x) && !Number.isNaN(y)) return x - y;
  return String(a) < b ? -1 : String(a) > b ? 1 : 0;
};

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
  recoverCalls: Array<{ email: string; redirectTo: string | null }> = [];
  recoverRateLimited = false;
  passwordUpdates: string[] = [];
  signupCalls: Array<Record<string, unknown>> = [];
  /** In-memory tables; RLS is not modelled (the database job covers it). */
  tables: Record<string, Row[]> = {};
  rpcs: Record<string, (args: Record<string, unknown>, user?: FakeUser) => unknown> = this.defaultRpcs();
  rpcCalls: Array<{ name: string; args: Record<string, unknown>; user?: string }> = [];
  writes: Array<{ table: string; method: string; body: unknown }> = [];
  /** Tables whose writes fail with a server error (to test failed-save handling). */
  failWrites = new Set<string>();
  uploads: string[] = [];
  g50PdfCalls: Array<Record<string, unknown>> = [];
  receipts: Row[] = [];
  admins = new Set<string>();
  /** Portal clients linked to the signed-in accountant (get_linked_client_names). */
  linkedClients: Row[] = [];

  rows(table: string): Row[] { return (this.tables[table] ??= []); }
  /** Links a seeded client account to every accountant, as an accepted invitation does. */
  linkClient(email: string, extra: Row = {}) {
    const u = this.users.find((x) => x.email === email);
    if (!u) return;
    this.linkedClients.push({
      id: u.id, full_name: u.name, email: u.email, direction: null, commune: null, bp: null, company: u.company ?? null, phone: null,
      address: null, legal_form: "SARL", activity: null, tax_regime: "REEL", tax_id: null, nis: null, rc: null,
      cnas_no: null, casnos_no: null, has_cacobatph: false, ...extra,
    });
  }
  makeAdmin(email: string) {
    const u = this.users.find((x) => x.email === email);
    if (u) this.admins.add(u.id);
  }

  private defaultRpcs(): FakeSupabase["rpcs"] {
    const accountants = () => this.users.filter((x) => x.role === "accountant");
    return {
      is_admin: (_a, user) => !!user && this.admins.has(user.id),
      admin_list_accountants: () => accountants().map((x) => ({
        user_id: x.id, name: x.name, email: x.email, company: x.company ?? null, account_status: x.accountStatus, created_at: new Date().toISOString(),
      })),
      admin_set_accountant_status: (a) => {
        const x = this.users.find((v) => v.id === a._user_id);
        if (!x) throw new Error("Accountant not found");
        x.accountStatus = a._status as FakeUser["accountStatus"];
        return null;
      },
      get_linked_client_names: () => this.linkedClients,
      admin_open_alert_count: () => 0,
      admin_list_security_alerts: () => [],
      my_subscription: () => [{ plan: "standard", state: "unrestricted", trial_ends_at: null, paid_until: null, grace_days: 7, ends_at: null }],
      admin_get_billing_settings: () => ({}),
      admin_list_subscriptions: () => accountants().map((x) => ({
        user_id: x.id, name: x.name, email: x.email, company: x.company ?? null, account_status: x.accountStatus,
        plan: "standard", state: "unrestricted", trial_ends_at: null, paid_until: null, grace_days: 7,
      })),
      admin_void_receipt: (a) => {
        const r = this.receipts.find((x) => x.id === a._receipt_id);
        if (!r || r.voided_at) throw new Error("Receipt not found or already void");
        r.voided_at = new Date().toISOString();
        r.void_reason = a._reason;
        return null;
      },
      admin_list_receipts: (a) => this.receipts.filter((r) => !a._accountant_id || r.accountant_id === a._accountant_id),
      admin_record_payment: (a) => {
        const seq = this.receipts.length + 1;
        const r: Row = {
          id: `rec-${seq}`, receipt_no: `REC-2026-${String(seq).padStart(6, "0")}`, accountant_id: a._accountant_id,
          payer: { name: this.users.find((x) => x.id === a._accountant_id)?.name }, issuer: {},
          amount: a._amount, currency: "DZD", method: a._method, plan: a._plan ?? "standard", period_months: a._period_months,
          period_start: new Date().toISOString(), period_end: new Date().toISOString(), paid_at: new Date().toISOString().slice(0, 10),
          note: a._note ?? null, voided_at: null, void_reason: null,
        };
        this.receipts.push(r);
        return r;
      },
    };
  }

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

  /** The URL hash Supabase puts on the link in a password-recovery email. */
  recoveryHash(email: string) {
    const u = this.users.find((x) => x.email === email)!;
    const s = this.session(u);
    return `#access_token=${s.access_token}&expires_in=3600&refresh_token=${s.refresh_token}&token_type=bearer&type=recovery`;
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
      if (url.pathname === "/auth/v1/user" && req.method() === "GET") {
        const u = this.userFromRequest(route);
        return u ? json(200, this.authUser(u)) : json(401, { code: 401, msg: "invalid JWT" });
      }
      if (url.pathname === "/auth/v1/recover") {
        const body = req.postDataJSON() as { email: string };
        this.recoverCalls.push({ email: body.email, redirectTo: url.searchParams.get("redirect_to") });
        if (this.recoverRateLimited) return json(429, { code: "over_email_send_rate_limit", msg: "email rate limit exceeded" });
        return json(200, {}); // same answer whether or not the address has an account
      }
      if (url.pathname === "/auth/v1/user" && req.method() === "PUT") {
        const u = this.userFromRequest(route);
        if (!u) return json(401, { code: 401, msg: "invalid JWT" });
        const next = (req.postDataJSON() as { password?: string }).password;
        if (next === undefined) return json(200, this.authUser(u)); // metadata-only update (e.g. language)
        if (next === u.password) return json(422, { code: "same_password", error_code: "same_password", msg: "New password should be different from the old password." });
        u.password = next;
        this.passwordUpdates.push(u.email);
        return json(200, this.authUser(u));
      }
      if (url.pathname === "/auth/v1/logout") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*" } });
      if (url.pathname.startsWith("/auth/v1/")) return json(200, {});

      // ---- Edge functions ----
      if (url.pathname === "/functions/v1/g50-pdf") {
        // Stub: the real function draws the official form (covered by its own unit tests).
        this.g50PdfCalls.push((req.postDataJSON() as { input?: Record<string, unknown> })?.input ?? {});
        return json(200, { pdfBase64: Buffer.from("%PDF-1.4 e2e stub").toString("base64") });
      }

      // ---- Storage ----
      if (url.pathname.startsWith("/storage/v1/object/")) {
        const key = url.pathname.replace("/storage/v1/object/", "");
        if (req.method() === "POST" || req.method() === "PUT") {
          this.uploads.push(key);
          return json(200, { Key: key, Id: key });
        }
        return route.fulfill({ status: 200, contentType: "application/pdf", headers: { "access-control-allow-origin": "*" }, body: "%PDF-1.4 e2e stub" });
      }
      if (url.pathname.startsWith("/storage/v1/")) return json(200, {});

      // ---- RPC ----
      const u = this.userFromRequest(route);
      if (url.pathname.startsWith("/rest/v1/rpc/")) {
        const name = url.pathname.replace("/rest/v1/rpc/", "");
        const args = (req.postDataJSON() ?? {}) as Record<string, unknown>;
        this.rpcCalls.push({ name, args, user: u?.email });
        const handler = this.rpcs[name];
        if (!handler) return json(200, null);
        try {
          return json(200, handler(args, u));
        } catch (e) {
          return json(400, { code: "P0001", message: e instanceof Error ? e.message : String(e) });
        }
      }

      // ---- REST tables ----
      const table = url.pathname.replace("/rest/v1/", "");
      if (url.pathname.startsWith("/rest/v1/")) {
        const rows = (this.tables[table] ??= []);
        let pred: (r: Row) => boolean;
        try { pred = this.filters(url); } catch (e) { return json(400, { code: "PGRST100", message: String(e) }); }
        const wantsObject = (req.headers()["accept"] ?? "").includes("vnd.pgrst.object");
        const prefer = req.headers()["prefer"] ?? "";
        const send = (data: unknown[], status = 200) => {
          if (wantsObject) {
            return data.length === 1 ? json(status, data[0]) : json(406, { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" });
          }
          return json(status, data);
        };
        if (req.method() === "GET" || req.method() === "HEAD") {
          if (table === "profiles" && u && !rows.some((r) => r.user_id === u.id)) {
            return send([{ user_id: u.id, name: u.name, email: u.email, company: u.company ?? null, user_type: u.role, account_status: u.accountStatus, linked_accountant_id: u.linkedAccountantId ?? null }]);
          }
          let out = rows.filter(pred);
          const order = url.searchParams.get("order");
          if (order) {
            const [col, dir] = order.split(".");
            out = [...out].sort((a, b) => (String(a[col] ?? "") < String(b[col] ?? "") ? -1 : 1) * (dir === "desc" ? -1 : 1));
          }
          const limit = Number(url.searchParams.get("limit"));
          return send(limit > 0 ? out.slice(0, limit) : out);
        }
        const body = req.postDataJSON() as Record<string, unknown> | Record<string, unknown>[] | null;
        this.writes.push({ table, method: req.method(), body });
        if (this.failWrites.has(table)) return json(500, { code: "XX000", message: "simulated failure" });
        if (req.method() === "POST") {
          const list = (Array.isArray(body) ? body : [body ?? {}]).map((r) => ({ id: randomUUID(), created_at: new Date().toISOString(), ...r }));
          const conflict = (url.searchParams.get("on_conflict") ?? "id").split(",").filter(Boolean);
          const upsert = prefer.includes("resolution=merge-duplicates");
          const ignore = prefer.includes("resolution=ignore-duplicates");
          const stored: Row[] = [];
          for (const r of list) {
            const at = upsert || ignore ? rows.findIndex((x) => conflict.every((c) => x[c] !== undefined && x[c] === r[c])) : -1;
            if (at >= 0 && upsert) { rows[at] = { ...rows[at], ...r, id: rows[at].id, created_at: rows[at].created_at }; stored.push(rows[at]); }
            else if (at < 0) { rows.push(r); stored.push(r); }
          }
          list.splice(0, list.length, ...stored);
          return prefer.includes("return=representation") ? send(list, 201) : route.fulfill({ status: 201, headers: { "access-control-allow-origin": "*" }, body: "" });
        }
        if (req.method() === "PATCH") {
          const hit = rows.filter(pred);
          for (const r of hit) Object.assign(r, body);
          return prefer.includes("return=representation") ? send(hit) : route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*" } });
        }
        if (req.method() === "DELETE") {
          this.tables[table] = rows.filter((r) => !pred(r));
          return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*" } });
        }
      }
      return json(404, {});
    });
  }

  /** PostgREST-style column filters (eq, in, is, neq, gte, lte) from the query string. */
  private filters(url: URL) {
    const checks: Array<(r: Row) => boolean> = [];
    for (const [col, expr] of url.searchParams) {
      if (["select", "order", "limit", "offset", "on_conflict", "columns"].includes(col)) continue;
      const m = /^(not\.)?(eq|neq|in|is|gte|lte|gt|lt)\.(.*)$/.exec(expr);
      // Real PostgREST would apply (or reject) every filter; silently ignoring one would match all rows.
      if (!m) throw new Error(`fake backend: unsupported filter ${col}=${expr}`);
      const [, neg, op, raw] = m;
      const test = (r: Row): boolean => {
        const v = r[col];
        switch (op) {
          case "eq": return String(v) === raw;
          case "neq": return String(v) !== raw;
          case "is": return raw === "null" ? v == null : String(v) === raw;
          case "in": return raw.replace(/^\(|\)$/g, "").split(",").map((x) => x.replace(/^"|"$/g, "")).includes(String(v));
          case "gte": return cmp(v, raw) >= 0;
          case "lte": return cmp(v, raw) <= 0;
          case "gt": return cmp(v, raw) > 0;
          default: return cmp(v, raw) < 0;
        }
      };
      checks.push(neg ? (r) => !test(r) : test);
    }
    return (r: Row) => checks.every((c) => c(r));
  }
}
