import {
  pgTable,
  uuid,
  text,
  boolean,
  bigint,
  integer,
  real,
  numeric,
  jsonb,
  timestamp,
  uniqueIndex,
  index,
  customType,
  check,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

// ─── Custom vector type (pgvector) ───────────────────────────────────────────
// drizzle-orm doesn't ship vector natively yet; we define it manually.
const vector = customType<{ data: number[]; driverData: string }>({
  dataType(config) {
    const dim = (config as { dimensions?: number })?.dimensions ?? 1536;
    return `vector(${dim})`;
  },
  toDriver(value: number[]): string {
    return `[${value.join(",")}]`;
  },
  fromDriver(value: string): number[] {
    return value
      .replace(/[\[\]]/g, "")
      .split(",")
      .map(Number);
  },
});

// ─── Tenants ──────────────────────────────────────────────────────────────────
export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  storageBytes: bigint("storage_bytes", { mode: "number" }).notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Users ────────────────────────────────────────────────────────────────────
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    email: text("email").notNull().unique(),
    hashedPassword: text("hashed_password"),
    name: text("name"),
    avatarUrl: text("avatar_url"),
    role: text("role").notNull().default("admin"),
    emailVerified: boolean("email_verified").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    roleCheck: check("role_check", sql`${t.role} IN ('admin','viewer')`),
  })
);

// ─── Email tokens ─────────────────────────────────────────────────────────────
export const emailTokens = pgTable("email_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  tokenSha256: text("token_sha256").notNull().unique(),
  type: text("type").notNull(), // 'verify' | 'reset'
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  used: boolean("used").notNull().default(false),
});

// ─── Knowledge Bases ──────────────────────────────────────────────────────────
export const knowledgeBases = pgTable("knowledge_bases", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  name: text("name").notNull(),
  description: text("description"),
  docCount: integer("doc_count").notNull().default(0),
  chunkCount: integer("chunk_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Documents ────────────────────────────────────────────────────────────────
export const documents = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    kbId: uuid("kb_id")
      .notNull()
      .references(() => knowledgeBases.id, { onDelete: "cascade" }),
    uploadedBy: uuid("uploaded_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    sourceType: text("source_type").notNull(), // 'pdf'|'docx'|'url'|'txt'
    r2Key: text("r2_key"),
    contentHash: text("content_hash"),
    fileSizeBytes: bigint("file_size_bytes", { mode: "number" }).notNull().default(0),
    pageCount: integer("page_count"),
    chunkCount: integer("chunk_count").notNull().default(0),
    status: text("status").notNull().default("pending"),
    // 'pending'|'processing'|'parsed'|'embedding'|'ready'|'distilling'|'distilled'|'failed'
    errorMessage: text("error_message"),
    chunkSize: integer("chunk_size").notNull().default(512),
    chunkOverlap: integer("chunk_overlap").notNull().default(64),
    // ── HERALD additions ─────────────────────────────────────────────────────
    // Populated by the Distillation Engine after ingestion completes
    summary: text("summary"),
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    // doc_type: contract|report|policy|invoice|manual|technical|legal|other
    docType: text("doc_type"),
    distilledAt: timestamp("distilled_at", { withTimezone: true }),
    nodeCount: integer("node_count").notNull().default(0),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
    indexedAt: timestamp("indexed_at", { withTimezone: true }),
  },
  (t) => ({
    dedupe: uniqueIndex("documents_tenant_hash_idx").on(t.tenantId, t.contentHash),
    statusIdx: index("documents_status_idx").on(t.tenantId, t.kbId, t.status),
    uploadedAtIdx: index("documents_uploaded_at_idx").on(t.tenantId, t.uploadedAt),
  })
);

// ─── Chunks ───────────────────────────────────────────────────────────────────
export const chunks = pgTable(
  "chunks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    kbId: uuid("kb_id")
      .notNull()
      .references(() => knowledgeBases.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    pageNumber: integer("page_number"),
    chunkIndex: integer("chunk_index").notNull(),
    tokenCount: integer("token_count").notNull(),
    embedding: vector("embedding", { dimensions: 768 } as never),
    // ── HERALD additions ─────────────────────────────────────────────────────
    // Tracks how often this chunk appears in retrieval results across all queries.
    // The Promoter job uses this to identify chunks worth distilling into KG nodes.
    retrievalCount: integer("retrieval_count").notNull().default(0),
    lastRetrievedAt: timestamp("last_retrieved_at", { withTimezone: true }),
    // Parent chunk for small-to-big retrieval: retrieve small chunk, serve parent to LLM
    parentChunkId: uuid("parent_chunk_id"),
    // Set to true once this chunk has been promoted to a KG node by the Promoter
    isPromoted: boolean("is_promoted").notNull().default(false),
    // content_tsv is a GENERATED column — Drizzle doesn't support it natively.
    // It's created by the SQL migration and used directly in raw SQL queries.
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantKbIdx: index("chunks_tenant_kb_idx").on(t.tenantId, t.kbId),
    unembeddedIdx: index("chunks_unembedded_idx").on(t.tenantId, t.kbId),
    retrievalCountIdx: index("chunks_retrieval_count_idx").on(t.tenantId, t.kbId, t.retrievalCount),
    // HNSW, GIN, and generated column indexes are created via raw SQL migration
  })
);

// ─── Conversations ────────────────────────────────────────────────────────────
export const conversations = pgTable("conversations", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  kbId: uuid("kb_id")
    .notNull()
    .references(() => knowledgeBases.id, { onDelete: "cascade" }),
  title: text("title"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastActive: timestamp("last_active", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Messages ─────────────────────────────────────────────────────────────────
export const messages = pgTable("messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  conversationId: uuid("conversation_id")
    .notNull()
    .references(() => conversations.id, { onDelete: "cascade" }),
  role: text("role").notNull(), // 'user' | 'assistant'
  content: text("content").notNull(),
  confidence: text("confidence"), // 'high'|'medium'|'low'|'none'
  confidenceScore: real("confidence_score"),
  latencyMs: integer("latency_ms"),
  promptTokens: integer("prompt_tokens"),
  completionTokens: integer("completion_tokens"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Citations ────────────────────────────────────────────────────────────────
export const citations = pgTable("citations", {
  id: uuid("id").primaryKey().defaultRandom(),
  messageId: uuid("message_id")
    .notNull()
    .references(() => messages.id, { onDelete: "cascade" }),
  chunkId: uuid("chunk_id")
    .notNull()
    .references(() => chunks.id, { onDelete: "cascade" }),
  documentId: uuid("document_id")
    .notNull()
    .references(() => documents.id, { onDelete: "cascade" }),
  docName: text("doc_name").notNull(),
  pageNumber: integer("page_number"),
  excerpt: text("excerpt").notNull(),
  score: real("score").notNull(),
  rank: integer("rank").notNull(),
});

// ─── Usage Events ─────────────────────────────────────────────────────────────
export const usageEvents = pgTable("usage_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  eventType: text("event_type").notNull(), // 'embed'|'chat'|'eval'
  model: text("model").notNull(),
  promptTokens: integer("prompt_tokens").notNull().default(0),
  completionTokens: integer("completion_tokens").notNull().default(0),
  totalTokens: integer("total_tokens").notNull().default(0),
  costUsd: numeric("cost_usd", { precision: 10, scale: 6 }).notNull().default("0"),
  kbId: uuid("kb_id").references(() => knowledgeBases.id, { onDelete: "set null" }),
  documentId: uuid("document_id").references(() => documents.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── KG Nodes (HERALD Hot Layer) ─────────────────────────────────────────────
// OKF-style structured knowledge nodes, auto-distilled from document chunks.
// Form the "Hot Layer" of the HERALD architecture — pre-structured, pre-validated,
// served directly to the LLM without re-retrieval overhead.
export const kgNodes = pgTable(
  "kg_nodes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    kbId: uuid("kb_id")
      .notNull()
      .references(() => knowledgeBases.id, { onDelete: "cascade" }),
    documentId: uuid("document_id").references(() => documents.id, { onDelete: "set null" }),
    chunkIds: uuid("chunk_ids").array().notNull().default(sql`'{}'::uuid[]`),
    // type: concept|entity|definition|fact|procedure|requirement
    type: text("type").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    // relationships: [{ target_title: string, relationship: string }]
    relationships: jsonb("relationships").notNull().default(sql`'[]'::jsonb`),
    embedding: vector("embedding", { dimensions: 768 } as never),
    retrievalCount: integer("retrieval_count").notNull().default(0),
    // confidence: 0.0-1.0; auto-generated nodes = 0.85, manually edited = 1.0
    confidence: real("confidence").notNull().default(0.85),
    // Set true by contradiction detector when a newer doc conflicts with this node
    needsReview: boolean("needs_review").notNull().default(false),
    reviewReason: text("review_reason"),
    autoGenerated: boolean("auto_generated").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantKbIdx: index("kg_nodes_tenant_kb_idx").on(t.tenantId, t.kbId),
    typeIdx: index("kg_nodes_type_idx").on(t.tenantId, t.kbId, t.type),
    needsReviewIdx: index("kg_nodes_needs_review_idx").on(t.tenantId, t.kbId, t.needsReview),
    // GIN indexes on tags and title trigrams are created via SQL migration
    // HNSW index on embedding is created manually after first data load
  })
);

// ─── KG Edges (HERALD Knowledge Graph) ───────────────────────────────────────
// Directed edges between KG nodes forming the knowledge graph.
// Relationship types: defines|references|contradicts|extends|requires|part_of
export const kgEdges = pgTable(
  "kg_edges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    kbId: uuid("kb_id")
      .notNull()
      .references(() => knowledgeBases.id, { onDelete: "cascade" }),
    fromNodeId: uuid("from_node_id")
      .notNull()
      .references(() => kgNodes.id, { onDelete: "cascade" }),
    toNodeId: uuid("to_node_id")
      .notNull()
      .references(() => kgNodes.id, { onDelete: "cascade" }),
    relationship: text("relationship").notNull(),
    weight: real("weight").notNull().default(1.0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    fromIdx: index("kg_edges_from_idx").on(t.fromNodeId),
    toIdx: index("kg_edges_to_idx").on(t.toNodeId),
    kbIdx: index("kg_edges_kb_idx").on(t.tenantId, t.kbId),
  })
);

// ─── Eval Datasets ────────────────────────────────────────────────────────────
export const evalDatasets = pgTable("eval_datasets", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  kbId: uuid("kb_id")
    .notNull()
    .references(() => knowledgeBases.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const evalCases = pgTable("eval_cases", {
  id: uuid("id").primaryKey().defaultRandom(),
  datasetId: uuid("dataset_id")
    .notNull()
    .references(() => evalDatasets.id, { onDelete: "cascade" }),
  question: text("question").notNull(),
  expectedAnswer: text("expected_answer"),
  expectedDocIds: uuid("expected_doc_ids").array(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const evalRuns = pgTable("eval_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  datasetId: uuid("dataset_id")
    .notNull()
    .references(() => evalDatasets.id, { onDelete: "cascade" }),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  label: text("label"),
  avgRetrievalRelevance: real("avg_retrieval_relevance"),
  avgContextRelevance: real("avg_context_relevance"),
  avgFaithfulness: real("avg_faithfulness"),
  avgAnswerRelevance: real("avg_answer_relevance"),
  avgCitationAccuracy: real("avg_citation_accuracy"),
  passedCount: integer("passed_count"),
  totalCount: integer("total_count"),
  config: jsonb("config"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const evalResults = pgTable("eval_results", {
  id: uuid("id").primaryKey().defaultRandom(),
  runId: uuid("run_id")
    .notNull()
    .references(() => evalRuns.id, { onDelete: "cascade" }),
  caseId: uuid("case_id")
    .notNull()
    .references(() => evalCases.id, { onDelete: "cascade" }),
  generatedAnswer: text("generated_answer").notNull(),
  retrievedChunkIds: uuid("retrieved_chunk_ids").array(),
  retrievalRelevance: real("retrieval_relevance"),
  contextRelevance: real("context_relevance"),
  faithfulness: real("faithfulness"),
  answerRelevance: real("answer_relevance"),
  citationAccuracy: real("citation_accuracy"),
  passed: boolean("passed").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Relations ────────────────────────────────────────────────────────────────
export const tenantsRelations = relations(tenants, ({ many }) => ({
  users: many(users),
  knowledgeBases: many(knowledgeBases),
  documents: many(documents),
  chunks: many(chunks),
  conversations: many(conversations),
  usageEvents: many(usageEvents),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  tenant: one(tenants, { fields: [users.tenantId], references: [tenants.id] }),
  knowledgeBases: many(knowledgeBases),
  conversations: many(conversations),
}));

export const knowledgeBasesRelations = relations(knowledgeBases, ({ one, many }) => ({
  tenant: one(tenants, { fields: [knowledgeBases.tenantId], references: [tenants.id] }),
  creator: one(users, { fields: [knowledgeBases.createdBy], references: [users.id] }),
  documents: many(documents),
  conversations: many(conversations),
}));

export const documentsRelations = relations(documents, ({ one, many }) => ({
  tenant: one(tenants, { fields: [documents.tenantId], references: [tenants.id] }),
  kb: one(knowledgeBases, { fields: [documents.kbId], references: [knowledgeBases.id] }),
  uploader: one(users, { fields: [documents.uploadedBy], references: [users.id] }),
  chunks: many(chunks),
}));

export const chunksRelations = relations(chunks, ({ one }) => ({
  document: one(documents, { fields: [chunks.documentId], references: [documents.id] }),
  tenant: one(tenants, { fields: [chunks.tenantId], references: [tenants.id] }),
  kb: one(knowledgeBases, { fields: [chunks.kbId], references: [knowledgeBases.id] }),
}));

export const conversationsRelations = relations(conversations, ({ one, many }) => ({
  tenant: one(tenants, { fields: [conversations.tenantId], references: [tenants.id] }),
  user: one(users, { fields: [conversations.userId], references: [users.id] }),
  kb: one(knowledgeBases, { fields: [conversations.kbId], references: [knowledgeBases.id] }),
  messages: many(messages),
}));

export const messagesRelations = relations(messages, ({ one, many }) => ({
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
  citations: many(citations),
}));

export const citationsRelations = relations(citations, ({ one }) => ({
  message: one(messages, { fields: [citations.messageId], references: [messages.id] }),
  chunk: one(chunks, { fields: [citations.chunkId], references: [chunks.id] }),
  document: one(documents, { fields: [citations.documentId], references: [documents.id] }),
}));

export const evalDatasetsRelations = relations(evalDatasets, ({ one, many }) => ({
  tenant: one(tenants, { fields: [evalDatasets.tenantId], references: [tenants.id] }),
  kb: one(knowledgeBases, { fields: [evalDatasets.kbId], references: [knowledgeBases.id] }),
  cases: many(evalCases),
  runs: many(evalRuns),
}));

export const evalCasesRelations = relations(evalCases, ({ one, many }) => ({
  dataset: one(evalDatasets, { fields: [evalCases.datasetId], references: [evalDatasets.id] }),
  results: many(evalResults),
}));

export const evalRunsRelations = relations(evalRuns, ({ one, many }) => ({
  dataset: one(evalDatasets, { fields: [evalRuns.datasetId], references: [evalDatasets.id] }),
  tenant: one(tenants, { fields: [evalRuns.tenantId], references: [tenants.id] }),
  results: many(evalResults),
}));

export const evalResultsRelations = relations(evalResults, ({ one }) => ({
  run: one(evalRuns, { fields: [evalResults.runId], references: [evalRuns.id] }),
  case: one(evalCases, { fields: [evalResults.caseId], references: [evalCases.id] }),
}));

export const usageEventsRelations = relations(usageEvents, ({ one }) => ({
  tenant: one(tenants, { fields: [usageEvents.tenantId], references: [tenants.id] }),
  user: one(users, { fields: [usageEvents.userId], references: [users.id] }),
  kb: one(knowledgeBases, { fields: [usageEvents.kbId], references: [knowledgeBases.id] }),
}));

// ─── HERALD Relations ─────────────────────────────────────────────────────────

export const kgNodesRelations = relations(kgNodes, ({ one, many }) => ({
  tenant: one(tenants, { fields: [kgNodes.tenantId], references: [tenants.id] }),
  kb: one(knowledgeBases, { fields: [kgNodes.kbId], references: [knowledgeBases.id] }),
  document: one(documents, { fields: [kgNodes.documentId], references: [documents.id] }),
  outgoingEdges: many(kgEdges, { relationName: "fromNode" }),
  incomingEdges: many(kgEdges, { relationName: "toNode" }),
}));

export const kgEdgesRelations = relations(kgEdges, ({ one }) => ({
  tenant: one(tenants, { fields: [kgEdges.tenantId], references: [tenants.id] }),
  kb: one(knowledgeBases, { fields: [kgEdges.kbId], references: [knowledgeBases.id] }),
  fromNode: one(kgNodes, {
    fields: [kgEdges.fromNodeId],
    references: [kgNodes.id],
    relationName: "fromNode",
  }),
  toNode: one(kgNodes, {
    fields: [kgEdges.toNodeId],
    references: [kgNodes.id],
    relationName: "toNode",
  }),
}));
