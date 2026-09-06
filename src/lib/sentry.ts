// Error monitoring, ready to plug in.
//
// Set VITE_SENTRY_DSN (in .env.local for dev, and in your Vercel project's
// Environment Variables for prod) to turn this on. Until that variable is
// set, initSentry() does nothing — no network calls, no console noise.
//
// How to get a DSN:
//   1. Create a free account at https://sentry.io/signup/ (Developer plan
//      is free and plenty for a pilot: 5k errors/month).
//   2. Create a new project, platform "React", and give it a name (e.g.
//      "cabadra-frontend").
//   3. Sentry shows you a DSN that looks like
//      https://<key>@o<org>.ingest.us.sentry.io/<project>
//      Copy it into VITE_SENTRY_DSN.
//   4. Add the same value to Vercel: Project → Settings → Environment
//      Variables → VITE_SENTRY_DSN → redeploy.
// That's it — no code changes needed on your end after that; this file
// picks it up automatically at app startup.
import * as Sentry from '@sentry/react';

export function initSentry() {
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    // Session Replay + tracing are off by default to keep the free-tier
    // quota for actual errors. Flip these on later if useful:
    // integrations: [Sentry.browserTracingIntegration(), Sentry.replayIntegration()],
    // tracesSampleRate: 0.1,
    tracesSampleRate: 0,
  });
}

// Attach a human's identity to error reports once known (e.g. after staff
// login), so a Sentry issue shows who hit it instead of an anonymous user.
export function setSentryUser(user: { id: string; email?: string } | null) {
  if (!import.meta.env.VITE_SENTRY_DSN) return;
  Sentry.setUser(user ? { id: user.id, email: user.email } : null);
}

export const SentryErrorBoundary = Sentry.ErrorBoundary;
