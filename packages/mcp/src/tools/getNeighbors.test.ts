import { describe, expect, test } from "bun:test";
import type { FabricGraph } from "@khai93/fabric-core";
import type { LoadedFabricProject } from "../utils/loadFabricProject";
import { getNeighbors } from "./getNeighbors";

describe("getNeighbors", () => {
  test("limits neighbor output while reporting total matches", () => {
    const project = fixtureProject({
      nodes: [
        node("root"),
        node("a"),
        node("b"),
        node("c")
      ],
      edges: [
        { from: "root", to: "a", type: "depends_on" },
        { from: "root", to: "b", type: "depends_on" },
        { from: "root", to: "c", type: "depends_on" }
      ]
    });

    const result = getNeighbors(project, { id: "root", direction: "outgoing", limit: 2 });

    expect(result.neighbors.length).toEqual(2);
    expect(result.totalFound).toEqual(3);
    expect(result.truncated).toEqual(true);
    expect(result.limit).toEqual(2);
  });
});

function node(id: string): FabricGraph["nodes"][number] {
  return {
    id,
    name: id,
    type: "utility",
    owns: [`src/${id}.ts`],
    dependsOn: []
  };
}

function fixtureProject(graph: Pick<FabricGraph, "nodes" | "edges">): LoadedFabricProject {
  return {
    projectRoot: process.cwd(),
    fabDir: `${process.cwd()}/.fab`,
    graphPath: `${process.cwd()}/.fab/graph.json`,
    graph: {
      version: "test",
      generatedAt: new Date(0).toISOString(),
      projectRoot: process.cwd(),
      projectName: "test",
      filesScanned: 0,
      nodes: graph.nodes,
      edges: graph.edges
    }
  };
}
