import { getTableName } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/sqlite-core";

export function buildCascadeGraph(schema: Record<string, any>) {
  // Map of Parent Table -> Set of Child Tables that cascade
  const cascadeGraph = new Map<string, Set<string>>();

  for (const key in schema) {
    const table = schema[key];
    // Fast check if this is a Drizzle table object
    if (!table || !table[Symbol.for("drizzle:Name")]) continue;

    const config = getTableConfig(table);
    const childTableName = config.name;

    // Look through foreign keys for cascades
    for (const fk of config.foreignKeys) {
      if (fk.onDelete === "cascade") {
        const parentTableName = getTableName(fk.reference().foreignTable);

        if (!cascadeGraph.has(parentTableName)) {
          cascadeGraph.set(parentTableName, new Set());
        }
        cascadeGraph.get(parentTableName)!.add(childTableName);
      }
    }
  }

  return cascadeGraph;
}
