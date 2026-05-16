import DatabaseCtor from "better-sqlite3";

type Database = InstanceType<typeof DatabaseCtor>;

export type SqlStorageCursor<T = unknown> = {
  toArray(): T[];
  next(): IteratorResult<T>;
  raw(): SqlStorageCursor<unknown[]>;
  [Symbol.iterator](): IterableIterator<T>;
};

export type MockDOStorage = {
  sql: {
    exec<T = unknown>(sql: string, ...bindings: unknown[]): SqlStorageCursor<T>;
    databaseSize: number;
  };
  transactionSync<T>(callback: () => T): T;
};

function makeEmptyCursor<T>(): SqlStorageCursor<T> {
  const doneResult: IteratorResult<T> = { done: true, value: undefined };
  const emptyIter: IterableIterator<T> = {
    next: () => doneResult,
    [Symbol.iterator]: () => emptyIter,
  };
  return {
    toArray: () => [],
    next: () => doneResult,
    raw: () => makeEmptyCursor<unknown[]>(),
    [Symbol.iterator]: () => emptyIter,
  };
}

function makeCursor<T>(
  sqlite: Database,
  sql: string,
  params: unknown[],
  raw = false,
): SqlStorageCursor<T> {
  const stmt = sqlite.prepare(sql);
  if (raw) stmt.raw(true);

  let rows: T[];
  try {
    rows = params.length > 0 ? stmt.all(...params) : stmt.all();
  } catch {
    // Non-SELECT statement (INSERT, UPDATE, DELETE, CREATE, etc.)
    if (params.length > 0) {
      stmt.run(...params);
    } else {
      stmt.run();
    }
    return makeEmptyCursor<T>();
  }

  let index = 0;
  const iter: IterableIterator<T> = {
    next() {
      if (index < rows.length) {
        return { done: false, value: rows[index++] };
      }
      return { done: true, value: undefined };
    },
    [Symbol.iterator]() {
      return iter;
    },
  };

  return {
    toArray() {
      return rows;
    },
    next() {
      return iter.next();
    },
    raw() {
      return makeCursor(sqlite, sql, params, true);
    },
    [Symbol.iterator]() {
      return iter;
    },
  };
}

export function createMockDOStorage(sqlite: Database): MockDOStorage {
  return {
    sql: {
      exec<T>(sql: string, ...params: unknown[]) {
        return makeCursor<T>(sqlite, sql, params);
      },
      get databaseSize() {
        try {
          const pageCount = sqlite.prepare("PRAGMA page_count").get() as {
            page_count: number;
          };
          const pageSize = sqlite.prepare("PRAGMA page_size").get() as {
            page_size: number;
          };
          return pageCount.page_count * pageSize.page_size;
        } catch {
          return 0;
        }
      },
    },
    transactionSync<T>(callback: () => T): T {
      const tx = sqlite.transaction(callback);
      return tx();
    },
  };
}
