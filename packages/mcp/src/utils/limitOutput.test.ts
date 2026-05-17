import { describe, expect, test } from "bun:test";
import { clampMaxBytes, limitUtf8 } from "./limitOutput";

describe("limitOutput", () => {
  test("clamps max bytes to a hard cap", () => {
    expect(clampMaxBytes(undefined, 20_000, 100_000)).toEqual(20_000);
    expect(clampMaxBytes(200_000, 20_000, 100_000)).toEqual(100_000);
  });

  test("truncates utf8 content without exceeding byte limit", () => {
    const result = limitUtf8("abc😀def", 6);

    expect(result.truncated).toEqual(true);
    expect(new TextEncoder().encode(result.content).byteLength <= 6).toEqual(true);
  });
});
