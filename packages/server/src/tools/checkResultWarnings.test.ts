import { describe, it, expect } from "vitest";
import { checkResultWarnings } from "./checkResultWarnings";

describe("checkResultWarnings", () => {
  it("adds warning when result hits max limit", () => {
    const warnings: string[] = [];
    const result = Array(1000).fill({ id: 1 });

    checkResultWarnings(result, warnings, 1000);

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("1000 rows");
    expect(warnings[0]).toContain("paginate");
  });

  it("does not add warning when result is under limit", () => {
    const warnings: string[] = [];
    const result = Array(500).fill({ id: 1 });

    checkResultWarnings(result, warnings, 1000);

    expect(warnings).toHaveLength(0);
  });

  it("does not add warning for non-array results", () => {
    const warnings: string[] = [];

    checkResultWarnings({ id: 1 }, warnings, 1000);

    expect(warnings).toHaveLength(0);
  });

  it("does not add warning for empty array", () => {
    const warnings: string[] = [];

    checkResultWarnings([], warnings, 1000);

    expect(warnings).toHaveLength(0);
  });
});
