import { defineConfig } from "drizzle-kit";

// drizzle-kit needs the unpooled connection for migrations
// (pooled connections don't support DDL reliably)
//
// ⚠️  DO NOT run `drizzle-kit push` on this project.
// schema.ts contains generated columns (content_tsv) and raw-SQL indexes
// (HNSW, GIN trgm) that Drizzle does not model — push will try to drop them.
// Apply migrations manually using the SQL files in ./drizzle/:
//   Get-Content drizzle/000X_name.sql | psql "<DATABASE_URL_UNPOOLED>"
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
