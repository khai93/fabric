import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import type { FabricGraph } from "@khai93/fabric-core";
import type { LoadedFabricProject } from "../utils/loadFabricProject";
import { getNode } from "./getNode";

describe("getNode", () => {
  test("returns compact node metadata and bounded summary text by default", async () => {
    const root = await makeTempProject();
    await mkdir(join(root, ".fab", "summaries"), { recursive: true });
    await writeFile(join(root, ".fab", "summaries", "large.md"), "x".repeat(5_000));
    const project = fixtureProject(root, {
      nodes: [
        {
          id: "utility.large",
          name: "Large Utility",
          type: "utility",
          owns: Array.from({ length: 25 }, (_, index) => `src/file-${index}.ts`),
          dependsOn: Array.from({ length: 25 }, (_, index) => `dependency.${index}`),
          summaryPath: ".fab/summaries/large.md"
        }
      ],
      edges: []
    });

    const result = await getNode(project, { id: "utility.large" });

    expect(result.summary.length).toEqual(4_000);
    expect(result.summaryTruncated).toEqual(true);
    expect(result.node.owns.length).toEqual(20);
    expect(result.node.dependsOn.length).toEqual(20);
    expect(result.node.totalOwnedFiles).toEqual(25);
    expect(result.node.totalDependencies).toEqual(25);
    expect(result.node.ownsTruncated).toEqual(true);
    expect(result.node.dependsOnTruncated).toEqual(true);
  });
});

async function makeTempProject(): Promise<string> {
  const path = join("/tmp", `fabric-get-node-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  await mkdir(path, { recursive: true });
  return path;
}

function fixtureProject(root: string, graph: Pick<FabricGraph, "nodes" | "edges">): LoadedFabricProject {
  return {
    projectRoot: root,
    fabDir: `${root}/.fab`,
    graphPath: `${root}/.fab/graph.json`,
    graph: {
      version: "test",
      generatedAt: new Date(0).toISOString(),
      projectRoot: root,
      projectName: "test",
      filesScanned: 0,
      nodes: graph.nodes,
      edges: graph.edges
    }
  };
}
