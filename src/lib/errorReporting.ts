// Error reporting (Sentry). Off unless VITE_SENTRY_DSN is set at build time.
// Sentry is imported lazily so it costs nothing in the bundle path when disabled.

const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;

type SentryModule = typeof import("@sentry/react");
let sentry: Promise<SentryModule> | null = null;

export const initErrorReporting = () => {
  if (!dsn || sentry) return;
  sentry = import("@sentry/react").then((S) => {
    S.init({
      dsn,
      environment: import.meta.env.MODE,
      tracesSampleRate: 0,
      // v11 replaced sendDefaultPii with dataCollection, whose defaults collect user info, cookies and
      // headers: switch everything off explicitly (payroll and client data must never reach Sentry).
      dataCollection: { userInfo: false, cookies: false, httpHeaders: false, httpBodies: [], urlQueryParams: false },
    });
    return S;
  });
  sentry.catch(() => { sentry = null; });
};

export const reportError = (error: unknown, context?: Record<string, unknown>) => {
  if (!sentry) return;
  sentry.then((S) => S.captureException(error, { extra: context })).catch(() => {});
};
