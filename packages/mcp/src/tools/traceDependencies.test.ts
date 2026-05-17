import { describe, expect, test } from "bun:test";
import type { FabricGraph } from "@khai93/fabric-core";
import { bfs } from "./traceDependencies";

describe("bfs", () => {
  test("finds the shortest dependency path deterministically", () => {
    const graph: FabricGraph = {
      version: "test",
      generatedAt: new Date(0).toISOString(),
      projectRoot: process.cwd(),
      projectName: "test",
      filesScanned: 0,
      nodes: [],
      edges: [
        { from: "route.login", to: "service.auth", type: "depends_on" },
        { from: "service.auth", to: "repository.user", type: "depends_on" },
        { from: "route.login", to: "utility.cookie", type: "depends_on" },
        { from: "utility.cookie", to: "repository.user", type: "depends_on" }
      ]
    };

    expect(bfs(graph, "route.login", "repository.user", 5)).toEqual([
      "route.login",
      "service.auth",
      "repository.user"
    ]);
  });

  test("respects max depth", () => {
    const graph: FabricGraph = {
      version: "test",
      generatedAt: new Date(0).toISOString(),
      projectRoot: process.cwd(),
      projectName: "test",
      filesScanned: 0,
      nodes: [],
      edges: [
        { from: "a", to: "b", type: "depends_on" },
        { from: "b", to: "c", type: "depends_on" }
      ]
    };

    expect(bfs(graph, "a", "c", 1)).toEqual([]);
  });
});
