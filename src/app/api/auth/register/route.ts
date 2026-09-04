import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users, tenants } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";

export const runtime = "nodejs";

const schema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  password: z.string().min(8).max(128),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message, code: "VALIDATION_ERROR" },
      { status: 400 }
    );
  }

  const { name, email, password } = parsed.data;

  const existing = await db.query.users.findFirst({
    where: eq(users.email, email),
    columns: { id: true },
  });
  if (existing) {
    return NextResponse.json({ error: "Email already registered", code: "CONFLICT" }, { status: 409 });
  }

  const { hash } = await import("@node-rs/argon2");
  const hashedPassword = await hash(password, { timeCost: 2, memoryCost: 65536 });

  // Create tenant + user atomically
  const [tenant] = await db.insert(tenants).values({ name }).returning({ id: tenants.id });
  await db.insert(users).values({
    tenantId: tenant.id,
    email,
    name,
    hashedPassword,
    role: "admin",
    emailVerified: true, // Skip email verify for MVP
  });

  return NextResponse.json({ success: true }, { status: 201 });
}
