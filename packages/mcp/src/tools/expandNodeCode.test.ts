import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { safeProjectFile } from "./expandNodeCode";

describe("safeProjectFile", () => {
  test("rejects traversal outside project root", () => {
    const result = safeProjectFile("/tmp/project", "../secret.txt");

    expect(result.ok).toEqual(false);
  });

  test("rejects obvious secret files", () => {
    const result = safeProjectFile("/tmp/project", ".env.local");

    expect(result.ok).toEqual(false);
  });

  test("allows normal project files", () => {
    const result = safeProjectFile("/tmp/project", "src/index.ts");

    expect(result.ok).toEqual(true);
    if (result.ok) {
      expect(result.absolutePath).toEqual(resolve("/tmp/project/src/index.ts"));
    }
  });
});
