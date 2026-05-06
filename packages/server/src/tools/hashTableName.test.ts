import { describe, it, expect } from "vitest";
import { hashMetaTableNames } from "./hashTableName";

describe("hashMetaTableNames", () => {
  it("produces consistent hash for the same input", () => {
    const result = hashMetaTableNames(["users"]);
    expect(result).toHaveLength(1);
    expect(typeof result[0]).toBe("string");
  });

  it("produces different hashes for different inputs", () => {
    const hashes = hashMetaTableNames(["users", "posts", "comments"]);
    const unique = new Set(hashes);
    expect(unique.size).toBe(3);
  });

  it("handles empty array", () => {
    expect(hashMetaTableNames([])).toEqual([]);
  });

  it("maps each table name to a short hash string", () => {
    const hashes = hashMetaTableNames(["users", "posts"]);
    hashes.forEach((hash) => {
      expect(hash.length).toBeLessThan(10);
      expect(/^[a-z0-9]+$/.test(hash)).toBe(true);
    });
  });
});
