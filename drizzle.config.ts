import { defineConfig } from "drizzle-kit";

// drizzle-kit needs the unpooled connection for migrations
// (pooled connections don't support DDL reliably)
export default defineConfig({
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? "",
  },
  verbose: true,
  strict: true,
});
