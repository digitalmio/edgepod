import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSelectProxy } from "./createSelectProxy";

function createMockBuilder(
  options: { resultData?: Record<string, unknown>[]; limit?: number } = {},
) {
  const { resultData = [], limit: initialLimit } = options;
  let currentLimit = initialLimit;

  const builder: Record<string, unknown> = {
    limit: vi.fn(function (n: number) {
      currentLimit = n;
      const opts: { resultData: Record<string, unknown>[]; limit: number } = {
        resultData,
        limit: n,
      };
      return createMockBuilder(opts);
    }),
    where: vi.fn(function () {
      return builder;
    }),
    from: vi.fn(function () {
      return builder;
    }),
    leftJoin: vi.fn(function () {
      return builder;
    }),
    innerJoin: vi.fn(function () {
      return builder;
    }),
    rightJoin: vi.fn(function () {
      return builder;
    }),
    fullJoin: vi.fn(function () {
      return builder;
    }),
    // oxlint-disable-next-line unicorn/no-thenable
    then: vi.fn(function (resolve: (v: unknown) => void, reject: (e: unknown) => void) {
      const finalLimit = currentLimit ?? 1000;
      return Promise.resolve(resultData.slice(0, finalLimit)).then(resolve, reject);
    }),
  };

  return builder;
}

describe("createSelectProxy", () => {
  let warnings: string[];

  beforeEach(() => {
    warnings = [];
  });

  it("auto-applies max limit when none set", async () => {
    const builder = createMockBuilder({ resultData: Array(2000).fill({ id: 1 }) });
    const proxy = createSelectProxy(builder, warnings, 1000);

    const result = await proxy;

    expect(result).toHaveLength(1000);
  });

  it("respects user-set limit under max", async () => {
    const builder = createMockBuilder({ resultData: Array(100).fill({ id: 1 }) });
    const proxy = createSelectProxy(builder, warnings, 1000);

    const withLimit = proxy.limit(50);
    const result = await withLimit;

    expect(result).toHaveLength(50);
  });

  it("caps limit at max", async () => {
    const builder = createMockBuilder({ resultData: Array(5000).fill({ id: 1 }) });
    const proxy = createSelectProxy(builder, warnings, 1000);

    const withLimit = proxy.limit(5000);
    const result = await withLimit;

    expect(result).toHaveLength(1000);
  });

  it("adds warning when user limit exceeds max", async () => {
    const builder = createMockBuilder({ resultData: [] });
    const proxy = createSelectProxy(builder, warnings, 1000);

    await proxy.limit(5000);

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("5000");
    expect(warnings[0]).toContain("1000");
  });

  it("adds warning when result hits max limit", async () => {
    const builder = createMockBuilder({ resultData: Array(1000).fill({ id: 1 }) });
    const proxy = createSelectProxy(builder, warnings, 1000);

    await proxy;

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("1000 rows");
    expect(warnings[0]).toContain("paginate");
  });

  it("does not add warning when result is under limit", async () => {
    const builder = createMockBuilder({ resultData: Array(100).fill({ id: 1 }) });
    const proxy = createSelectProxy(builder, warnings, 1000);

    await proxy;

    expect(warnings).toHaveLength(0);
  });

  it("preserves proxy through chained method calls", () => {
    const builder = createMockBuilder();
    const proxy = createSelectProxy(builder, warnings, 1000);

    const withWhere = proxy.where({ id: 1 });
    expect(withWhere).toBeDefined();
    expect(typeof withWhere.then).toBe("function");
  });

  it("original proxy still applies max limit after .limit() on a branch", async () => {
    const builder = createMockBuilder({ resultData: Array(2000).fill({ id: 1 }) });
    const proxy = createSelectProxy(builder, warnings, 1000);

    proxy.limit(50);
    const result = await proxy;

    expect(result).toHaveLength(1000);
  });
});
