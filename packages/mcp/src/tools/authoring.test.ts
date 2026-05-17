import { describe, expect, test } from "bun:test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { FabricGraph } from "@khai93/fabric-core";
import { validateFabric } from "@khai93/fabric-core";
import type { LoadedFabricProject } from "../utils/loadFabricProject";
import {
  getGenerationInstructions,
  rebuildGraph,
  writeNode,
  writeSummary
} from "./authoring";

describe("MCP authoring tools", () => {
  test("rejects unsafe node IDs", async () => {
    const project = await fixtureProject();
    const result = await writeNode(project, {
      mode: "upsert",
      node: validNode({ id: "../service.auth" })
    });

    expect(readOk(result)).toEqual(false);
    expect(JSON.stringify(result).includes("INVALID_NODE_ID")).toEqual(true);
  });

  test("rejects path traversal in owned files", async () => {
    const project = await fixtureProject();
    const result = await writeNode(project, {
      mode: "upsert",
      node: validNode({ owns: ["../src/auth.ts"] })
    });

    expect(readOk(result)).toEqual(false);
    expect(JSON.stringify(result).includes("INVALID_OWNED_PATH")).toEqual(true);
  });

  test("write_node writes only inside .fab/nodes", async () => {
    const project = await fixtureProject();
    const result = await writeNode(project, {
      mode: "upsert",
      node: validNode()
    });

    expect(result).toEqual({
      ok: true,
      path: ".fab/nodes/service.auth.node.json",
      mode: "upsert",
      warnings: []
    });
    expect(existsSync(join(project.fabDir, "nodes", "service.auth.node.json"))).toEqual(true);
    expect(existsSync(join(project.projectRoot, "service.auth.node.json"))).toEqual(false);
  });

  test("write_summary writes only inside .fab/summaries", async () => {
    const project = await fixtureProject();
    await writeNode(project, { mode: "upsert", node: validNode() });

    const result = await writeSummary(project, {
      nodeId: "service.auth",
      summary: "# Auth Service\n"
    });

    expect(result).toEqual({
      ok: true,
      path: ".fab/summaries/service.auth.summary.md",
      warnings: []
    });
    expect(await readFile(join(project.fabDir, "summaries", "service.auth.summary.md"), "utf8")).toEqual("# Auth Service\n");
    expect(existsSync(join(project.projectRoot, "service.auth.summary.md"))).toEqual(false);
  });

  test("rebuild_graph creates expected edges from dependsOn", async () => {
    const project = await fixtureProject({ evidenceFiles: ["src/auth.ts", "src/user.ts"] });
    await writeNode(project, { mode: "upsert", node: validNode() });
    await writeNode(project, {
      mode: "upsert",
      node: validNode({
        id: "repository.user",
        name: "User Repository",
        type: "repository",
        owns: ["src/user.ts"],
        dependsOn: []
      })
    });

    const result = await rebuildGraph(project);
    const graph = JSON.parse(await readFile(join(project.fabDir, "graph.json"), "utf8")) as FabricGraph;

    expect(result.edgeCount).toEqual(1);
    expect(graph.edges).toEqual([
      {
        from: "service.auth",
        to: "repository.user",
        type: "depends_on",
        evidence: [
          {
            file: "src/auth.ts",
            reason: "Auth service file."
          }
        ]
      }
    ]);
  });

  test("validate catches unknown dependency IDs", async () => {
    const project = await fixtureProject();
    await writeNode(project, { mode: "upsert", node: validNode() });

    const result = await validateFabric(project.projectRoot);

    expect(result.ok).toEqual(false);
    expect(result.errors.map((error) => error.code).includes("UNKNOWN_DEPENDENCY")).toEqual(true);
  });

  test("validate catches missing owned files", async () => {
    const project = await fixtureProject({ evidenceFiles: [] });
    const nodePath = join(project.fabDir, "nodes", "service.auth.node.json");
    await writeFile(nodePath, `${JSON.stringify(validNode(), null, 2)}\n`);

    const result = await validateFabric(project.projectRoot);

    expect(result.ok).toEqual(false);
    expect(result.errors.map((error) => error.code).includes("MISSING_OWNED_FILE")).toEqual(true);
  });

  test("get_generation_instructions includes the required workflow", () => {
    const result = getGenerationInstructions();

    expect(result.instructions.includes("Call fabric.get_repo_context")).toEqual(true);
    expect(result.instructions.includes("Call fabric.list_evidence_files")).toEqual(true);
    expect(result.instructions.includes("Write nodes using fabric.write_node")).toEqual(true);
    expect(result.instructions.includes("Call fabric.validate")).toEqual(true);
  });
});

async function fixtureProject(options: { evidenceFiles?: string[] } = {}): Promise<LoadedFabricProject> {
  const projectRoot = join("/tmp", `fabric-authoring-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await mkdir(projectRoot, { recursive: true });
  const fabDir = join(projectRoot, ".fab");
  await mkdir(join(fabDir, "nodes"), { recursive: true });
  await mkdir(join(fabDir, "summaries"), { recursive: true });
  await mkdir(join(fabDir, "evidence"), { recursive: true });

  const evidenceFiles = options.evidenceFiles ?? ["src/auth.ts"];
  await writeFile(join(fabDir, "evidence", "files.json"), `${JSON.stringify(evidenceFiles.map((path) => ({ path })), null, 2)}\n`);

  const graph: FabricGraph = {
    version: "0.3.0",
    generatedAt: new Date(0).toISOString(),
    projectRoot,
    projectName: "test",
    filesScanned: evidenceFiles.length,
    nodes: [],
    edges: []
  };
  await writeFile(join(fabDir, "graph.json"), `${JSON.stringify(graph, null, 2)}\n`);

  return {
    projectRoot,
    fabDir,
    graphPath: join(fabDir, "graph.json"),
    graph
  };
}

function validNode(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "service.auth",
    name: "Auth Service",
    type: "service",
    description: "Handles authentication.",
    owns: ["src/auth.ts"],
    dependsOn: ["repository.user"],
    tags: ["auth"],
    summaryPath: ".fab/summaries/service.auth.summary.md",
    evidence: [
      {
        file: "src/auth.ts",
        reason: "Auth service file."
      }
    ],
    confidence: 0.86,
    generatedBy: "ai",
    warnings: [],
    ...overrides
  };
}

function readOk(value: Record<string, unknown>): unknown {
  return value.ok;
}
