import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";

export type EventLevel = "info" | "warn" | "error";
export type AppEvent = {
  kind: string;
  message: string;
  level?: EventLevel;
  org?: string | null;
  actor?: string | null;
  personaId?: string | null;
  conversationId?: string | null;
  runId?: string | null;
  durationMs?: number | null;
  data?: Record<string, unknown>;
};

const MAX_STRING = 4000;

/** Keeps logged data small: long strings are cut, deep structures are kept as they are. */
function trim(value: unknown, depth = 0): unknown {
  if (typeof value === "string") return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…[${value.length} chars]` : value;
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => trim(v, depth + 1));
  if (value && typeof value === "object" && depth < 4) {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, trim(v, depth + 1)]));
  }
  return value;
}

/**
 * Records what happened (see app_events). Never throws and never blocks on failure: logging must
 * not break the thing being logged. Also writes one JSON line to the server log.
 */
export async function logEvent(e: AppEvent): Promise<void> {
  try {
    let org = e.org ?? null;
    if (!org && e.personaId) {
      const p = await db.query.personas.findFirst({ where: eq(schema.personas.id, e.personaId), columns: { org: true } });
      org = p?.org ?? null;
    }
    const row = {
      kind: e.kind,
      level: e.level ?? "info",
      message: e.message.slice(0, 2000),
      org,
      actor: e.actor ?? null,
      personaId: e.personaId ?? null,
      conversationId: e.conversationId ?? null,
      runId: e.runId ?? null,
      durationMs: e.durationMs == null ? null : Math.round(e.durationMs),
      data: e.data ? (trim(e.data) as Record<string, unknown>) : null,
    };
    console[row.level === "error" ? "error" : row.level === "warn" ? "warn" : "log"](JSON.stringify({ event: row.kind, ...row }));
    await db.insert(schema.appEvents).values(row);
  } catch (err) {
    console.error("logEvent failed", err);
  }
}

export function errorData(err: unknown) {
  const e = err as Error & { status?: number };
  return { error: e?.message ?? String(err), name: e?.name, status: e?.status, stack: e?.stack?.split("\n").slice(0, 6).join("\n") };
}
