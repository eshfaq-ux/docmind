import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";
import { NextResponse } from "next/server";

/**
 * Route protection middleware.
 * Uses the edge-safe authConfig (no argon2 / DB imports).
 * - Public routes: /login, /register, /api/auth/*, /api/health
 * - Everything else requires a valid session
 */
const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const { pathname } = req.nextUrl;

  const publicPaths = [
    "/login",
    "/register",
    "/verify-email",
    "/api/auth",
    "/api/health",
  ];

  // Root "/" is an exact match; all other public paths use prefix matching.
  const isPublic =
    pathname === "/" ||
    publicPaths.some((p) => pathname.startsWith(p));

  if (!isPublic && !req.auth) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Redirect authenticated users away from auth pages and marketing root
  if (req.auth && (pathname === "/login" || pathname === "/register" || pathname === "/")) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    // Match everything except static files, images, and _next internals
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
