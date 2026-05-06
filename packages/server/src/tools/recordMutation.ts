export function recordMutationWithCascades(
  tableName: string,
  tablesWritten: Set<string>,
  cascadeGraph: Map<string, Set<string>>,
) {
  if (tablesWritten.has(tableName)) return;
  tablesWritten.add(tableName);
  const children = cascadeGraph.get(tableName);
  if (children) {
    for (const child of children) {
      recordMutationWithCascades(child, tablesWritten, cascadeGraph);
    }
  }
}
