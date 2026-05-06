import { describe, it, expect, vi } from "vitest";
import { createMutationProxy } from "./createMutationProxy";

function createMockBuilder() {
  const builder: Record<string, unknown> = {
    where: vi.fn(function () {
      return createMockBuilder();
    }),
    withoutWhere: vi.fn(function () {
      return createMockBuilder();
    }),
    run: vi.fn(function () {
      return Promise.resolve({ changes: 1 });
    }),
    all: vi.fn(function () {
      return Promise.resolve([]);
    }),
    get: vi.fn(function () {
      return Promise.resolve({ id: 1 });
    }),
    values: vi.fn(function () {
      return Promise.resolve([]);
    }),
    execute: vi.fn(function () {
      return Promise.resolve();
    }),
    returning: vi.fn(function () {
      const inner = createMockBuilder();
      inner.__thenable = true;
      return inner;
    }),
  };

  return builder;
}

describe("createMutationProxy", () => {
  it("blocks update without WHERE clause", () => {
    const builder = createMockBuilder();
    const proxy = createMutationProxy(builder, [], "update");

    expect(() => proxy.run()).toThrow("UPDATE without WHERE is blocked");
  });

  it("blocks delete without WHERE clause", () => {
    const builder = createMockBuilder();
    const proxy = createMutationProxy(builder, [], "delete");

    expect(() => proxy.run()).toThrow("DELETE without WHERE is blocked");
  });

  it("allows update with WHERE clause", async () => {
    const builder = createMockBuilder();
    const proxy = createMutationProxy(builder, [], "update");

    const withWhere = proxy.where({ id: 1 });
    const result = await withWhere.run();

    expect(result).toEqual({ changes: 1 });
  });

  it("allows delete with WHERE clause", async () => {
    const builder = createMockBuilder();
    const proxy = createMutationProxy(builder, [], "delete");

    const withWhere = proxy.where({ id: 1 });
    const result = await withWhere.run();

    expect(result).toEqual({ changes: 1 });
  });

  it("allows mutation with withoutWhere", async () => {
    const builder = createMockBuilder();
    const proxy = createMutationProxy(builder, [], "update");

    const withoutWhere = proxy.withoutWhere();
    const result = await withoutWhere.run();

    expect(result).toEqual({ changes: 1 });
  });

  it("preserves proxy through chained methods", () => {
    const builder = createMockBuilder();
    const proxy = createMutationProxy(builder, [], "update");

    const chained = proxy.where({ id: 1 });
    expect(() => chained.run()).not.toThrow();
  });

  it("blocks via .then() without WHERE", () => {
    const builder = createMockBuilder();
    // oxlint-disable-next-line unicorn/no-thenable
    builder.then = vi.fn(function () {
      return Promise.resolve({ changes: 1 });
    });

    const proxy = createMutationProxy(builder, [], "update");

    expect(() => proxy.then(() => {})).toThrow("UPDATE without WHERE is blocked");
  });

  it("allows via .then() with WHERE", async () => {
    const builder = createMockBuilder();
    const whereResult = createMockBuilder();
    builder.where = vi.fn(() => whereResult);
    // oxlint-disable-next-line unicorn/no-thenable
    whereResult.then = vi.fn(function (resolve: (v: unknown) => void) {
      resolve({ changes: 1 });
      return Promise.resolve({ changes: 1 });
    });

    const proxy = createMutationProxy(builder, [], "update");
    const withWhere = proxy.where({ id: 1 });

    const result = await new Promise((resolve) => {
      withWhere.then(resolve);
    });

    expect(result).toEqual({ changes: 1 });
  });

  const executionMethods = ["all", "get", "values", "execute"] as const;

  executionMethods.forEach((method) => {
    it(`blocks .${method}() without WHERE on update`, () => {
      const builder = createMockBuilder();
      const proxy = createMutationProxy(builder, [], "update");

      expect(() => proxy[method]()).toThrow("UPDATE without WHERE is blocked");
    });

    it(`allows .${method}() with WHERE on update`, async () => {
      const builder = createMockBuilder();
      const proxy = createMutationProxy(builder, [], "update");
      const withWhere = proxy.where({ id: 1 });

      await withWhere[method]();
    });
  });

  it("wraps thenable method results in a new proxy", async () => {
    const builder = createMockBuilder();
    const proxy = createMutationProxy(builder, [], "update");
    const withWhere = proxy.where({ id: 1 });

    const returning = withWhere.returning();
    expect(typeof returning.where).toBe("function");
    expect(typeof returning.run).toBe("function");
  });

  it("returns non-function values as-is", () => {
    const builder = { ...createMockBuilder(), someProperty: 42 };
    const proxy = createMutationProxy(builder, [], "delete");

    expect(proxy.someProperty).toBe(42);
  });

  it("includes mutation type in error message", () => {
    const builder = createMockBuilder();
    const proxy = createMutationProxy(builder, [], "delete");

    expect(() => proxy.run()).toThrow("DELETE without WHERE is blocked");
  });

  it("wraps the builder returned by .where() — not the original", async () => {
    const builder = createMockBuilder();
    const whereResult = createMockBuilder();
    builder.where = vi.fn(() => whereResult);

    const proxy = createMutationProxy(builder, [], "update");
    const withWhere = proxy.where({ id: 1 });

    await withWhere.run();
    expect(whereResult.run).toHaveBeenCalled();
    expect(builder.run).not.toHaveBeenCalled();
  });

  it("wraps the builder returned by .withoutWhere() — not the original", async () => {
    const builder = createMockBuilder();
    const withoutWhereResult = createMockBuilder();
    builder.withoutWhere = vi.fn(() => withoutWhereResult);

    const proxy = createMutationProxy(builder, [], "delete");
    const withoutWhere = proxy.withoutWhere();

    await withoutWhere.run();
    expect(withoutWhereResult.run).toHaveBeenCalled();
    expect(builder.run).not.toHaveBeenCalled();
  });

  it("original proxy remains blocked after calling .where() on a branch", () => {
    const builder = createMockBuilder();
    const proxy = createMutationProxy(builder, [], "update");

    proxy.where({ id: 1 });
    expect(() => proxy.run()).toThrow("UPDATE without WHERE is blocked");
  });

  it("original proxy remains blocked after calling .withoutWhere() on a branch", () => {
    const builder = createMockBuilder();
    const proxy = createMutationProxy(builder, [], "delete");

    proxy.withoutWhere();
    expect(() => proxy.run()).toThrow("DELETE without WHERE is blocked");
  });
});
