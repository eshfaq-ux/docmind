import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { db } from "@/lib/db";
import { users, tenants } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { env } from "@/lib/env";
import { z } from "zod";
import { authConfig } from "@/lib/auth.config";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  secret: env.NEXTAUTH_SECRET,
  providers: [
    // Only register Google if credentials are configured
    ...(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      ? [
          Google({
            clientId: env.GOOGLE_CLIENT_ID,
            clientSecret: env.GOOGLE_CLIENT_SECRET,
          }),
        ]
      : []),
    Credentials({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const parsed = credentialsSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const { email, password } = parsed.data;

        const user = await db.query.users.findFirst({
          where: eq(users.email, email),
        });

        if (!user || !user.hashedPassword || !user.emailVerified) return null;

        // Dynamic import so argon2 only loads server-side
        const { verify } = await import("@node-rs/argon2");
        const valid = await verify(user.hashedPassword, password);
        if (!valid) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.avatarUrl,
          tenantId: user.tenantId,
          role: user.role,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger }) {
      if (user) {
        // First sign-in: attach tenantId + role to JWT
        token.sub = user.id;
        token.tenantId = (user as { tenantId?: string }).tenantId;
        token.role = (user as { role?: string }).role;
      }

      // For Google OAuth users: lookup/create tenant on first sign-in
      if (trigger === "signIn" && !token.tenantId) {
        const dbUser = await db.query.users.findFirst({
          where: eq(users.email, token.email!),
        });
        if (dbUser) {
          token.tenantId = dbUser.tenantId;
          token.role = dbUser.role;
          token.sub = dbUser.id;
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      if (token.tenantId) (session.user as { tenantId?: string }).tenantId = token.tenantId as string;
      if (token.role) (session.user as { role?: string }).role = token.role as string;
      return session;
    },
    async signIn({ user, account }) {
      // For Google OAuth: ensure user has a tenant.
      // Use INSERT ... ON CONFLICT to prevent races on concurrent first-sign-ins.
      if (account?.provider === "google" && user.email) {
        const existing = await db.query.users.findFirst({
          where: eq(users.email, user.email),
          columns: { id: true },
        });

        if (!existing) {
          // Atomic: create tenant first, then user with ON CONFLICT guard
          const [tenant] = await db
            .insert(tenants)
            .values({ name: user.name ?? user.email.split("@")[0] })
            .returning({ id: tenants.id });

          // ON CONFLICT DO NOTHING guards against the rare concurrent race
          // where two requests arrive for the same Google account simultaneously.
          await db
            .insert(users)
            .values({
              tenantId: tenant.id,
              email: user.email,
              name: user.name ?? null,
              avatarUrl: user.image ?? null,
              role: "admin",
              emailVerified: true, // Google-verified email
            })
            .onConflictDoNothing();
        }
      }
      return true;
    },
  },
});

// Augment next-auth types
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name?: string | null;
      image?: string | null;
      tenantId: string;
      role: "admin" | "viewer";
    };
  }
}
