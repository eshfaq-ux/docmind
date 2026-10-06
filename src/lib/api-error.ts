import { NextResponse } from "next/server";

export type ApiErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMIT"
  | "EMAIL_NOT_VERIFIED"
  | "INVALID_CREDENTIALS"
  | "INTERNAL_ERROR";

/** Consistent error shape for all API routes: { error, code } */
export function apiError(
  message: string,
  code: ApiErrorCode,
  status: number
) {
  return NextResponse.json({ error: message, code }, { status });
}

export const Errors = {
  unauthorized:       () => apiError("Unauthorized", "UNAUTHORIZED", 401),
  forbidden:          () => apiError("Forbidden", "FORBIDDEN", 403),
  notFound:           (what = "Resource") => apiError(`${what} not found`, "NOT_FOUND", 404),
  rateLimit:          () => apiError("Too many requests. Please try again later.", "RATE_LIMIT", 429),
  internal:           () => apiError("Something went wrong. Please try again.", "INTERNAL_ERROR", 500),
  invalidCredentials: () => apiError("Invalid email or password", "INVALID_CREDENTIALS", 401),
  emailNotVerified:   () => apiError("Please verify your email before signing in.", "EMAIL_NOT_VERIFIED", 403),
  conflict:           (what = "Resource") => apiError(`${what} already exists`, "CONFLICT", 409),
  validation:         (msg: string) => apiError(msg, "VALIDATION_ERROR", 400),
} as const;
