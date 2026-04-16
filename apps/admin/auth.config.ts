import type { NextAuthConfig } from "next-auth";
import GitHub from "next-auth/providers/github";

export const authConfig = {
  providers: [
    GitHub({
      clientId: process.env.HOMELAB_ADMIN_GITHUB_OAUTH_CLIENT_ID,
      clientSecret: process.env.HOMELAB_ADMIN_GITHUB_OAUTH_CLIENT_SECRET,
      // Auth.js v5 enables PKCE + state param by default — SEC-06 satisfied.
    }),
  ],
  session: { strategy: "jwt", maxAge: 60 * 60 * 8 }, // 8h = 28800s, SEC-07
  pages: { signIn: "/login" },
  trustHost: true, // required behind Caddy reverse proxy
  callbacks: {
    // authorized() is consulted by the auth() middleware wrapper.
    // Allowlist enforcement lives in middleware.ts — this just asserts "has a session".
    authorized: ({ auth }) => !!auth,
  },
} satisfies NextAuthConfig;
