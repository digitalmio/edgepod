import { parseStmt, traverse } from "sqlite3-parser";

export type ParsedQuery = {
  queryType: "select" | "insert" | "update" | "delete" | "unknown";
  tablesRead: string[];
  tablesWritten: string[];
  whereIds: Array<{ tableHint: string; column: string; paramIndices: number[] }>;
};

function getTableName(node: any): string | null {
  if (!node) return null;
  if (node.tblName?.objName?.text) return node.tblName.objName.text;
  if (node.objName?.text) return node.objName.text;
  return null;
}

export function parseSqlTracking(sql: string, params: unknown[]): ParsedQuery {
  const result = parseStmt(sql);
  if (result.status === "error") {
    return { queryType: "unknown", tablesRead: [], tablesWritten: [], whereIds: [] };
  }

  const root = result.root as any;
  let queryType: ParsedQuery["queryType"] = "unknown";
  let mainTable: string | null = null;

  if (root.type === "SelectStmt") {
    queryType = "select";
  } else if (root.type === "InsertStmt") {
    queryType = "insert";
    mainTable = getTableName(root);
  } else if (root.type === "UpdateStmt") {
    queryType = "update";
    mainTable = getTableName(root);
  } else if (root.type === "DeleteStmt") {
    queryType = "delete";
    mainTable = getTableName(root);
  }

  // Collect all CTE aliases so we can exclude them from the table list
  const cteAliases = new Set<string>();
  traverse(root, {
    enter(node: any) {
      if (node.type === "CommonTableExpr" && node.tblName?.text) {
        cteAliases.add(node.tblName.text);
      }
    },
  });

  // Collect ALL table references from every SelectFrom node in the AST.
  // SelectFrom appears in top-level SELECTs (SelectStmt → body → select),
  // subqueries (Select → select), UNION compounds (CompoundSelect → select),
  // and INSERT...SELECT (InsertStmt → ... → Select → select → SelectFrom).
  const allTables = new Set<string>();
  traverse(root, {
    enter(node: any) {
      if (node.type !== "SelectFrom" || !node.from) return;
      const items = node.from.select
        ? Array.isArray(node.from.select)
          ? node.from.select
          : [node.from.select]
        : [];
      for (const item of items) {
        const name = getTableName(item);
        if (name && !cteAliases.has(name)) allTables.add(name);
      }
      if (node.from.joins) {
        for (const join of node.from.joins) {
          const name = getTableName(join.table);
          if (name && !cteAliases.has(name)) allTables.add(name);
        }
      }
    },
  });

  const tablesRead: string[] = [];
  const tablesWritten: string[] = [];
  const whereIds: Array<{ tableHint: string; column: string; paramIndices: number[] }> = [];

  if (queryType === "select") {
    tablesRead.push(...allTables);
  } else if (queryType === "insert" || queryType === "update" || queryType === "delete") {
    if (mainTable) tablesWritten.push(mainTable);
    for (const t of allTables) {
      if (t !== mainTable) tablesRead.push(t);
    }
  }

  // Map ? positions to param indices by collecting all VariableExpr order
  const varExprs: Array<{ offset: number; node: any }> = [];
  traverse(root, {
    enter(node: any) {
      if (node.type === "VariableExpr" && node.name === "?") {
        varExprs.push({ offset: node.span?.offset ?? -1, node });
      }
    },
  });
  varExprs.sort((a, b) => a.offset - b.offset);

  const paramIndexForOffset = new Map<number, number>();
  varExprs.forEach((ve, i) => {
    paramIndexForOffset.set(ve.offset, i);
  });

  // Collect WHERE conditions with param references
  const visited = new Set<any>();
  traverse(root, {
    enter(node: any, _parent?: any) {
      if (visited.has(node)) return;
      visited.add(node);

      // "id = ?" pattern
      if (node.type === "BinaryExpr" && node.op === "Equals") {
        const columnName = extractColumnName(node.left);
        if (!columnName) return;
        const paramOffset = extractParamOffset(node.right);
        if (paramOffset === -1) return;
        const pIdx = paramIndexForOffset.get(paramOffset);
        if (pIdx !== undefined && pIdx < params.length) {
          const tableHint = extractTableHint(node.left);
          whereIds.push({ tableHint, column: columnName, paramIndices: [pIdx] });
        }
      }

      // "id IN (?, ?)" pattern
      if (node.type === "InListExpr" && Array.isArray(node.rhs)) {
        const columnName = extractColumnName(node.lhs);
        if (!columnName) return;
        const indices: number[] = [];
        for (const item of node.rhs) {
          const paramOffset = extractParamOffset(item);
          if (paramOffset === -1) continue;
          const pIdx = paramIndexForOffset.get(paramOffset);
          if (pIdx !== undefined && pIdx < params.length) {
            indices.push(pIdx);
          }
        }
        if (indices.length > 0) {
          const tableHint = extractTableHint(node.lhs);
          whereIds.push({ tableHint, column: columnName, paramIndices: indices });
        }
      }
    },
  });

  return { queryType, tablesRead, tablesWritten, whereIds };
}

function extractColumnName(node: any): string | null {
  if (!node) return null;
  if (node.type === "Id") return node.name;
  if (node.type === "QualifiedExpr" && node.column) return node.column.text ?? node.column.name;
  return null;
}

function extractTableHint(node: any): string {
  if (!node) return "";
  if (node.type === "QualifiedExpr" && node.table) return node.table.text ?? node.table.name ?? "";
  return "";
}

function extractParamOffset(node: any): number {
  if (!node || node.type !== "VariableExpr") return -1;
  return node.span?.offset ?? -1;
}
