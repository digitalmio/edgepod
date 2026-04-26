const EVENTS = ["INSERT", "UPDATE", "DELETE"] as const;

export const generateReactivityTriggersSql = (tableNames: string[]): string[] => {
  const statements: string[] = [
    `CREATE TABLE IF NOT EXISTS _edgepod_mutations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  table_name TEXT NOT NULL
)`,
  ];

  for (const tableName of tableNames) {
    for (const event of EVENTS) {
      statements.push(
        `CREATE TRIGGER IF NOT EXISTS _ep_${event.toLowerCase()}_${tableName}
AFTER ${event} ON "${tableName}"
BEGIN
  INSERT INTO _edgepod_mutations (table_name) VALUES ('${tableName}');
END`
      );
    }
  }

  return statements;
};
