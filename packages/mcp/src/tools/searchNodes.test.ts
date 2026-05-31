import { describe, expect, test } from "bun:test";
import type { FabricGraph } from "@khai93/fabric-core";
import type { LoadedFabricProject } from "../utils/loadFabricProject";
import { searchNodes } from "./searchNodes";

describe("searchNodes", () => {
  test("sorts by deterministic score then id", async () => {
    const project = fixtureProject({
      nodes: [
        {
          id: "service.auth",
          name: "Auth Service",
          type: "service",
          description: "Handles login tokens.",
          owns: ["src/services/auth.ts"],
          dependsOn: [],
          tags: ["auth"]
        },
        {
          id: "utility.token",
          name: "Token Utility",
          type: "utility",
          description: "JWT validation helpers.",
          owns: ["src/utils/token.ts"],
          dependsOn: [],
          tags: ["jwt"]
        },
        {
          id: "component.button",
          name: "Button",
          type: "component",
          owns: ["src/components/button.tsx"],
          dependsOn: []
        }
      ],
      edges: []
    });

    const result = await searchNodes(project, { query: "auth token", limit: 5 });

    expect(result.matches.map((match) => match.id)).toEqual(["service.auth", "utility.token"]);
    expect((result.matches[0]?.score ?? 0) > (result.matches[1]?.score ?? 0)).toEqual(true);
  });

  test("limits owned files in search results by default", async () => {
    const project = fixtureProject({
      nodes: [
        {
          id: "utility.large",
          name: "Large Utility",
          type: "utility",
          description: "Large utility with many files.",
          owns: [
            "src/one.ts",
            "src/two.ts",
            "src/three.ts",
            "src/four.ts",
            "src/five.ts",
            "src/six.ts"
          ],
          dependsOn: []
        }
      ],
      edges: []
    });

    const result = await searchNodes(project, { query: "large utility" });

    expect(result.matches[0]?.owns.length).toEqual(5);
    expect(result.matches[0]?.ownsTruncated).toEqual(true);
    expect(result.matches[0]?.totalOwnedFiles).toEqual(6);
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
