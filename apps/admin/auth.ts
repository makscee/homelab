import NextAuth from "next-auth";
import { authConfig } from "./auth.config";
import { isLoginAllowed } from "./lib/auth-allowlist";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,
    // Reject non-allowlisted logins at the OAuth signIn step so they never get a session token at all.
    async signIn({ profile }) {
      const login = (profile as { login?: string } | null | undefined)?.login;
      return isLoginAllowed(login);
    },
    async jwt({ token, profile }) {
      if (profile && typeof (profile as { login?: unknown }).login === "string") {
        token.login = (profile as { login: string }).login;
      }
      return token;
    },
    async session({ session, token }) {
      if (typeof token.login === "string") {
        (session.user as { login?: string }).login = token.login;
      }
      return session;
    },
  },
  cookies: {
    sessionToken: {
      name:
        process.env.NODE_ENV === "production"
          ? "__Secure-authjs.session-token"
          : "authjs.session-token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
      },
    },
  },
});
