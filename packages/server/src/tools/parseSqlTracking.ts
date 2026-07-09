import {
  type DeleteStmt,
  type FromClause,
  type InsertStmt,
  type JoinedSelectTable,
  type Name,
  type QualifiedName,
  type SelectTable,
  type UpdateStmt,
  parseStmt,
  traverse,
} from "sqlite3-parser";
import QuickLRU from "quick-lru";

export type ParsedQuery = {
  queryType: "select" | "insert" | "update" | "delete" | "unknown";
  tablesRead: string[];
  tablesWritten: string[];
};

const parseCache = new QuickLRU<string, ParsedQuery>({ maxSize: 128 });

export function clearParseCache(): void {
  parseCache.clear();
}

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

export function parseSqlTracking(sql: string): ParsedQuery {
  const cached = parseCache.get(sql);
  if (cached) return cached;

  const result = parseStmt(sql);
  if (result.status === "error") {
    const parsed: ParsedQuery = { queryType: "unknown", tablesRead: [], tablesWritten: [] };
    Object.freeze(parsed.tablesRead);
    Object.freeze(parsed.tablesWritten);
    Object.freeze(parsed);
    parseCache.set(sql, parsed);
    return parsed;
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

  if (queryType === "select") {
    tablesRead.push(...allTables);
  } else if (queryType === "insert" || queryType === "update" || queryType === "delete") {
    if (mainTable) tablesWritten.push(mainTable);
    for (const t of allTables) {
      if (t !== mainTable) tablesRead.push(t);
    }
  }

  const parsed: ParsedQuery = { queryType, tablesRead, tablesWritten };
  Object.freeze(parsed.tablesRead);
  Object.freeze(parsed.tablesWritten);
  Object.freeze(parsed);
  parseCache.set(sql, parsed);
  return parsed;
}
