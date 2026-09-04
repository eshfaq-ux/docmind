/**
 * Edge-safe auth config — no Node.js-only imports (no argon2, no DB).
 * Used by middleware. The full auth config in auth.ts adds the DB adapter
 * and argon2 password verification on top of this.
 */
import type { NextAuthConfig } from "next-auth";

export const authConfig: NextAuthConfig = {
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  providers: [],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.sub = user.id;
        token.tenantId = (user as { tenantId?: string }).tenantId;
        token.role = (user as { role?: string }).role;
      }
      return token;
    },
    async session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      if (token.tenantId)
        (session.user as { tenantId?: string }).tenantId =
          token.tenantId as string;
      if (token.role)
        (session.user as { role?: string }).role = token.role as string;
      return session;
    },
  },
};
