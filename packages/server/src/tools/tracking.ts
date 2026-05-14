import { parseSqlTracking } from "./parseSqlTracking";
import { hashTableName } from "./hashTableName";
import type { TrackContext } from "./createSafetyProxy";

export function cascadeWrite(table: string, written: Set<string>, graph: Map<string, Set<string>>) {
  if (written.has(table)) return;
  written.add(table);
  for (const child of graph.get(table) ?? []) cascadeWrite(child, written, graph);
}

export function addListener(table: string, ctx: TrackContext) {
  if (table === "unknown") return;
  ctx.activeSessions.get(ctx.sessionId)?.listeningToTables.add(hashTableName(table));
  ctx.tablesRead.add(table);
}

export function recordWhereIds(
  parsed: ReturnType<typeof parseSqlTracking>,
  params: unknown[],
  ctx: TrackContext,
) {
  for (const wid of parsed.whereIds) {
    let table = wid.tableHint || "";
    if (!table) {
      const first = parsed.tablesWritten[0];
      if (first) table = first;
    }
    if (!table) continue;
    const pkCols = ctx.pkMap.get(table);
    if (pkCols && !pkCols.includes(wid.column)) continue;
    for (const idx of wid.paramIndices) {
      if (idx < params.length) {
        const hashed = hashTableName(String(params[idx]));
        let ids = ctx.rowIds.get(table);
        if (!ids) {
          ids = new Set();
          ctx.rowIds.set(table, ids);
        }
        ids.add(hashed);
      }
    }
  }
}

export function trackExec(builder: any, ctx: TrackContext, tableHint?: string, queryType?: string) {
  try {
    const { sql, params } = builder.toSQL();
    const parsed = parseSqlTracking(sql, params);
    for (const t of parsed.tablesRead) addListener(t, ctx);
    for (const t of parsed.tablesWritten) {
      if (parsed.queryType === "delete") {
        cascadeWrite(t, ctx.tablesWritten, ctx.cascadeGraph);
      } else {
        ctx.tablesWritten.add(t);
      }
    }
    recordWhereIds(parsed, params, ctx);
  } catch {
    if (tableHint) {
      if (queryType === "delete") {
        cascadeWrite(tableHint, ctx.tablesWritten, ctx.cascadeGraph);
      } else {
        ctx.tablesWritten.add(tableHint);
      }
    }
  }
}

export function warnRowLimit(result: unknown, warnings: string[]) {
  if (Array.isArray(result) && result.length === 1000)
    warnings.push(
      "Query returned exactly 1000 rows — there may be more results. Use .limit() and .offset() to paginate.",
    );
}
