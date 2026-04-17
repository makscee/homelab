// csrf.shared.ts — constants shared between client and server.
// This module is NEUTRAL (isomorphic): it must remain free of any runtime
// sentinel that would poison the client bundle. Safe to import from .tsx
// client components (Plan 13-05 api-client.ts does exactly this).

export const CSRF_COOKIE_NAME = "hla-csrf";
export const CSRF_HEADER_NAME = "x-csrf-token";

// Resolution order:
//   1. NEXT_PUBLIC_EXPECTED_ORIGIN — inlined into the client bundle at build.
//   2. EXPECTED_ORIGIN            — runtime override set by the process env.
//   3. Fallback to the production homelab URL.
// The client-visible NEXT_PUBLIC_ variant is deliberate: api-client.ts needs
// the same origin string to construct fetch URLs, and Next.js only inlines
// env vars prefixed with NEXT_PUBLIC_.
export const EXPECTED_ORIGIN =
  process.env.NEXT_PUBLIC_EXPECTED_ORIGIN ??
  process.env.EXPECTED_ORIGIN ??
  "https://homelab.makscee.ru";
