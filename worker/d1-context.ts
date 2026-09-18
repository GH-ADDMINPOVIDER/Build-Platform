type D1Result<T = Record<string, unknown>> = { results?: T[] };
type D1Prepared = {
  bind: (...values: unknown[]) => D1Prepared;
  all: <T = Record<string, unknown>>() => Promise<D1Result<T>>;
  run: () => Promise<unknown>;
};
export type D1ContextDb = { prepare: (query: string) => D1Prepared };

export type CanonicalD1Context = {
  state: "LIVE" | "UNBOUND";
  text: string;
  counts: Record<string, number>;
};

function clip(value: unknown, max: number) {
  return String(value ?? "").trim().slice(0, max);
}

async function safeRows<T = Record<string, unknown>>(db: D1ContextDb, sql: string): Promise<T[]> {
  try {
    const result = await db.prepare(sql).all<T>();
    return result.results ?? [];
  } catch {
    return [];
  }
}

function section(label: string, rows: unknown[]) {
  if (!rows.length) return "";
  return `## ${label}\n${JSON.stringify(rows)}`;
}

export async function readCanonicalD1Context(db?: D1ContextDb): Promise<CanonicalD1Context> {
  if (!db) return { state: "UNBOUND", text: "D1 canonical context is not bound.", counts: {} };

  const [meta, toolkits, planes, policies, bindings, sources, knowledge] = await Promise.all([
    safeRows(db, "SELECT key, value FROM system_meta ORDER BY key LIMIT 60"),
    safeRows(db, "SELECT id, name, phase, status, entrypoint, control_plane, runtime_provider, database_provider, version, updated_at FROM toolkits ORDER BY updated_at DESC LIMIT 20"),
    safeRows(db, "SELECT id, ordinal, name, description, status, source_id, updated_at FROM system_planes ORDER BY ordinal LIMIT 40"),
    safeRows(db, "SELECT id, scope, rule_text, enforcement, enabled, source_id, updated_at FROM policy_rules WHERE enabled = 1 ORDER BY scope, id LIMIT 80"),
    safeRows(db, "SELECT provider_id, environment, binding_type, status, last_checked_at FROM provider_bindings ORDER BY provider_id, environment LIMIT 100"),
    safeRows(db, "SELECT id, provider_id, title, source_kind, status, precedence, migration_status, source_last_edited_at, updated_at FROM canonical_sources ORDER BY precedence, id LIMIT 80"),
    safeRows(db, "SELECT id, project_id, source_id, title, substr(body, 1, 2200) AS body, format, canonical, source_last_edited_at, updated_at FROM knowledge_documents ORDER BY canonical DESC, updated_at DESC LIMIT 10"),
  ]);

  const text = [
    section("SYSTEM_META", meta),
    section("TOOLKITS", toolkits),
    section("SYSTEM_PLANES", planes),
    section("POLICIES", policies),
    section("PROVIDER_BINDINGS", bindings),
    section("CANONICAL_SOURCES", sources),
    section("KNOWLEDGE_DOCUMENTS", knowledge),
  ].filter(Boolean).join("\n\n").slice(0, 24_000);

  return {
    state: "LIVE",
    text: text || "D1 is bound but no canonical rows were returned.",
    counts: {
      system_meta: meta.length,
      toolkits: toolkits.length,
      system_planes: planes.length,
      policies: policies.length,
      provider_bindings: bindings.length,
      canonical_sources: sources.length,
      knowledge_documents: knowledge.length,
    },
  };
}

export async function recordChatUsage(
  db: D1ContextDb | undefined,
  input: {
    conversationId: string;
    sourceSurface: string;
    model: string;
    poolId: string;
    usageTokens: number;
    route: string;
  },
) {
  if (!db || !Number.isFinite(input.usageTokens) || input.usageTokens <= 0) return;
  try {
    const now = Date.now();
    await db.prepare(
      `INSERT OR IGNORE INTO chat_conversations (id, owner_id, title, created_at, updated_at)
       VALUES (?, \'owner\', \'OGENIC SAME MIND\', ?, ?)`
    ).bind(clip(input.conversationId, 120), now, now).run();
    await db.prepare(
      `INSERT INTO chat_usage_ledger(
         id, conversation_id, source_surface, model, pool_id, usage_tokens, billed_route, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      `usage_${crypto.randomUUID()}`,
      clip(input.conversationId, 120),
      clip(input.sourceSurface, 60),
      clip(input.model, 120),
      clip(input.poolId, 80),
      Math.floor(input.usageTokens),
      clip(input.route, 80),
      Date.now(),
    ).run();
  } catch {
    // Ledger migration may not be applied yet. Never fail chat because metering
    // persistence is temporarily unavailable.
  }
}
