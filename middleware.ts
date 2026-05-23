import { clerkMiddleware } from "@clerk/nextjs/server";

// Using middleware.ts (NOT Next 16's new proxy.ts) on purpose: proxy.ts
// is locked to the Node.js runtime, which OpenNext on Cloudflare Workers
// cannot execute. middleware.ts runs on the Edge runtime, which Clerk's
// SDK supports natively. The Clerk CLI generated proxy.ts by default;
// we renamed because of the deploy target.

/**
 * Clerk middleware runs on every matched route but does NOT gate anything
 * by default. QScoring is a public-read content + score lookup product —
 * every page (home, blog, /score/*, /methodology, /glossary, /compare,
 * etc.) must remain reachable without authentication.
 *
 * What this middleware DOES give us:
 *   - Reads the session cookie and exposes it to server components via
 *     `auth()` from `@clerk/nextjs/server`, so Server Components/Actions
 *     can detect signed-in users without a client-side round trip.
 *   - Handles the `/__clerk/*` auto-proxy path the Clerk SDK uses for
 *     OAuth callbacks and token refresh.
 *
 * When we add gated features later (saved watchlists, portfolio history,
 * etc.), the right pattern is route-level protection — wrap the specific
 * page or API handler with `await auth.protect()` rather than adding a
 * route matcher here. That keeps the middleware boring and the gating
 * policy visible at the route that enforces it.
 */
export default clerkMiddleware();

export const config = {
  matcher: [
    // Skip Next internals + static assets — match every other route.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run on API and tRPC routes.
    "/(api|trpc)(.*)",
    // Clerk's auto-proxy endpoint — required for OAuth callbacks and
    // token-refresh paths used by the @clerk/nextjs SDK.
    "/__clerk/(.*)",
  ],
};
