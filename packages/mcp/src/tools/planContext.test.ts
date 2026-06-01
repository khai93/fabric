import { describe, expect, test } from "bun:test";
import type { FabricGraph } from "@khai93/fabric-core";
import type { LoadedFabricProject } from "../utils/loadFabricProject";
import { planContext } from "./planContext";

describe("planContext", () => {
  test("returns a compact edit plan with implementation nodes before tests", async () => {
    const project = fixtureProject({
      nodes: [
        {
          id: "unknown.projects",
          name: "projects",
          type: "unknown",
          description: "show projects command handler",
          owns: ["packages/nx/src/command-line/show/projects.ts"],
          dependsOn: []
        },
        {
          id: "test.projects",
          name: "projects tests",
          type: "test",
          description: "tests for show projects command",
          owns: ["packages/nx/src/command-line/show/projects.spec.ts"],
          dependsOn: []
        },
        {
          id: "utility.unrelated",
          name: "unrelated",
          type: "utility",
          description: "unrelated utility",
          owns: ["src/unrelated.ts"],
          dependsOn: []
        }
      ],
      edges: []
    });

    const result = await planContext(project, {
      task: "make nx show projects --json return sorted project names and update tests",
      mode: "edit"
    });

    expect(result.primaryNodes[0]?.id).toEqual("unknown.projects");
    expect(result.secondaryNodes.some((node) => node.id === "test.projects")).toEqual(true);
    expect(result.suggestedToolCalls[0]).toEqual({
      tool: "fabric.expand_node_code",
      args: { id: "unknown.projects" },
      reason: "Inspect primary implementation code."
    });
  });

  test("limits owned files in planned nodes", async () => {
    const project = fixtureProject({
      nodes: [
        {
          id: "utility.large",
          name: "large utility",
          type: "utility",
          description: "large utility",
          owns: ["a.ts", "b.ts", "c.ts", "d.ts", "e.ts"],
          dependsOn: []
        }
      ],
      edges: []
    });

    const result = await planContext(project, { task: "large utility", maxOwnedFiles: 2 });

    expect(result.primaryNodes[0]?.owns).toEqual(["a.ts", "b.ts"]);
    expect(result.primaryNodes[0]?.ownsTruncated).toEqual(true);
    expect(result.primaryNodes[0]?.totalOwnedFiles).toEqual(5);
  });
});

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
