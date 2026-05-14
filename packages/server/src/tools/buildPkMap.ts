import { getTableConfig } from "drizzle-orm/sqlite-core";

export function buildPkMap(schema: Record<string, unknown>): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const key in schema) {
    const table = schema[key];
    if (!table || !(table as any)[Symbol.for("drizzle:Name")]) continue;
    const config = getTableConfig(table as any);
    const pkCols = config.columns.filter((c: any) => c.primary).map((c: any) => c.name);
    map.set(config.name, pkCols);
  }
  return map;
}
