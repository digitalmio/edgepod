// Module augmentation to add .withoutWhere() to Drizzle mutation builders

declare module "drizzle-orm/sqlite-core/query-builders/update" {
  interface SQLiteUpdateBase {
    withoutWhere(): this;
  }
}

declare module "drizzle-orm/sqlite-core/query-builders/delete" {
  interface SQLiteDeleteBase {
    withoutWhere(): this;
  }
}
