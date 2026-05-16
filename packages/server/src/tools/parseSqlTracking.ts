import {
  type BinaryExpr,
  type DeleteStmt,
  type Expr,
  type FromClause,
  type Id,
  type InListExpr,
  type InsertStmt,
  type JoinedSelectTable,
  type Name,
  type QualifiedExpr,
  type QualifiedName,
  type SelectTable,
  type UpdateStmt,
  type VariableExpr,
  parseStmt,
  traverse,
} from "sqlite3-parser";

export type ParsedQuery = {
  queryType: "select" | "insert" | "update" | "delete" | "unknown";
  tablesRead: string[];
  tablesWritten: string[];
  whereIds: Array<{ tableHint: string; column: string; paramIndices: number[] }>;
};

function getNameText(n: Name): string {
  return n.text;
}

function getQualifiedName(qn: QualifiedName): string {
  return getNameText(qn.objName);
}

function getTableNameFromStmt(stmt: DeleteStmt | InsertStmt | UpdateStmt): string | null {
  return getQualifiedName(stmt.tblName);
}

function getTableNameFromSelectTable(st: SelectTable): string | null {
  if (st.type === "TableSelectTable" || st.type === "TableCallSelectTable") {
    return getQualifiedName(st.tblName);
  }
  return null;
}

function getTableNameFromFromClause(from: FromClause): string | null {
  const select = from.select;
  if (!select) return null;
  return getTableNameFromSelectTable(select);
}

function getTableNameFromJoined(j: JoinedSelectTable): string | null {
  return getTableNameFromSelectTable(j.table);
}

export function parseSqlTracking(sql: string, params: unknown[]): ParsedQuery {
  const result = parseStmt(sql);
  if (result.status === "error") {
    return { queryType: "unknown", tablesRead: [], tablesWritten: [], whereIds: [] };
  }

  const root = result.root;
  let queryType: ParsedQuery["queryType"] = "unknown";
  let mainTable: string | null = null;

  if (root.type === "SelectStmt") {
    queryType = "select";
  } else if (root.type === "InsertStmt") {
    queryType = "insert";
    mainTable = getTableNameFromStmt(root);
  } else if (root.type === "UpdateStmt") {
    queryType = "update";
    mainTable = getTableNameFromStmt(root);
  } else if (root.type === "DeleteStmt") {
    queryType = "delete";
    mainTable = getTableNameFromStmt(root);
  }

  // Collect all CTE aliases so we can exclude them from the table list
  const cteAliases = new Set<string>();
  traverse(root, {
    enter(node) {
      if (node.type === "CommonTableExpr") {
        cteAliases.add(getNameText(node.tblName));
      }
    },
  });

  // Collect ALL table references from every SelectFrom node in the AST.
  const allTables = new Set<string>();
  traverse(root, {
    enter(node) {
      if (node.type !== "SelectFrom") return;
      const from = node.from;
      if (!from) return;
      const name = getTableNameFromFromClause(from);
      if (name && !cteAliases.has(name)) allTables.add(name);
      if (from.joins) {
        for (const join of from.joins) {
          const joinName = getTableNameFromJoined(join);
          if (joinName && !cteAliases.has(joinName)) allTables.add(joinName);
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
  const varExprs: Array<{ offset: number; node: VariableExpr }> = [];
  traverse(root, {
    enter(node) {
      if (node.type === "VariableExpr" && node.name === "?") {
        varExprs.push({ offset: node.span.offset, node });
      }
    },
  });
  varExprs.sort((a, b) => a.offset - b.offset);

  const paramIndexForOffset = new Map<number, number>();
  varExprs.forEach((ve, i) => {
    paramIndexForOffset.set(ve.offset, i);
  });

  // Collect WHERE expressions from all WHERE clauses in the AST
  const whereExprs: Expr[] = [];
  traverse(root, {
    enter(node) {
      if ((node.type === "DeleteStmt" || node.type === "UpdateStmt") && node.whereClause) {
        whereExprs.push(node.whereClause);
      }
      if (node.type === "SelectFrom" && node.whereClause) {
        whereExprs.push(node.whereClause);
      }
    },
  });

  // Extract row IDs only from WHERE-clause expressions (not JOIN ON / HAVING)
  for (const whereExpr of whereExprs) {
    traverse(whereExpr, {
      enter(node) {
        // "id = ?" pattern
        if (node.type === "BinaryExpr" && node.op === "Equals") {
          const be = node as BinaryExpr;
          const columnName = extractColumnName(be.left);
          if (!columnName) return;
          const paramOffset = extractParamOffset(be.right);
          if (paramOffset === -1) return;
          const pIdx = paramIndexForOffset.get(paramOffset);
          if (pIdx !== undefined && pIdx < params.length) {
            const tableHint = extractTableHint(be.left);
            whereIds.push({ tableHint, column: columnName, paramIndices: [pIdx] });
          }
        }

        // "id IN (?, ?)" pattern
        if (node.type === "InListExpr") {
          const ie = node as InListExpr;
          if (!ie.rhs) return;
          const columnName = extractColumnName(ie.lhs);
          if (!columnName) return;
          const indices: number[] = [];
          for (const item of ie.rhs) {
            const paramOffset = extractParamOffset(item);
            if (paramOffset === -1) continue;
            const pIdx = paramIndexForOffset.get(paramOffset);
            if (pIdx !== undefined && pIdx < params.length) {
              indices.push(pIdx);
            }
          }
          if (indices.length > 0) {
            const tableHint = extractTableHint(ie.lhs);
            whereIds.push({ tableHint, column: columnName, paramIndices: indices });
          }
        }
      },
    });
  }

  return { queryType, tablesRead, tablesWritten, whereIds };
}

function extractColumnName(node: Expr | null): string | null {
  if (!node) return null;
  if (node.type === "Id") return (node as Id).name;
  if (node.type === "QualifiedExpr") {
    const qe = node as QualifiedExpr;
    return getNameText(qe.column);
  }
  return null;
}

function extractTableHint(node: Expr | null): string {
  if (!node) return "";
  if (node.type === "QualifiedExpr") {
    const qe = node as QualifiedExpr;
    return getNameText(qe.table);
  }
  return "";
}

function extractParamOffset(node: Expr | null): number {
  if (!node || node.type !== "VariableExpr") return -1;
  return (node as VariableExpr).span.offset;
}
