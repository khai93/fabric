import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { FabricEdge, FabricGraph, FabricNode } from "./types";
import { readNodeFiles } from "../nodes/readNodes";
import { writeExistingNodesEvidence } from "../evidence/writeEvidence";

export interface RebuildGraphResult {
  ok: true;
  nodeCount: number;
  edgeCount: number;
  ownershipCount: number;
  dependencyCount: number;
  warnings: string[];
}

export async function rebuildGraphFromNodeFiles(projectRoot: string): Promise<RebuildGraphResult> {
  const nodes = await readNodeFiles(projectRoot);
  const previousGraph = await readPreviousGraph(projectRoot);
  const edges = buildDependsOnEdges(nodes);
  const graph: FabricGraph = {
    version: "0.3.0",
    generatedAt: new Date(0).toISOString(),
    projectRoot,
    projectName: previousGraph?.projectName ?? await readProjectName(projectRoot),
    filesScanned: previousGraph?.filesScanned ?? countOwnedFiles(nodes),
    nodes,
    edges,
    warnings: previousGraph?.warnings ?? []
  };

  await writeFile(join(projectRoot, ".fab", "graph.json"), `${JSON.stringify(graph, null, 2)}\n`);
  await writeFile(join(projectRoot, ".fab", "ownership-map.json"), `${JSON.stringify(buildOwnershipMap(nodes), null, 2)}\n`);
  await writeFile(join(projectRoot, ".fab", "dependency-map.json"), `${JSON.stringify(buildDependencyMap(nodes), null, 2)}\n`);
  await writeExistingNodesEvidence(projectRoot, nodes);

  return {
    ok: true,
    nodeCount: nodes.length,
    edgeCount: edges.length,
    ownershipCount: countOwnedFiles(nodes),
    dependencyCount: edges.length,
    warnings: []
  };
}

function buildDependsOnEdges(nodes: FabricNode[]): FabricEdge[] {
  return nodes
    .flatMap((node) => [...new Set(node.dependsOn)].sort().map((dependency) => ({
      from: node.id,
      to: dependency,
      type: "depends_on" as const,
      evidence: node.evidence
    })))
    .sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to));
}

function buildOwnershipMap(nodes: FabricNode[]): Record<string, string[]> {
  return Object.fromEntries(nodes.map((node) => [node.id, [...new Set(node.owns)].sort()]));
}

function buildDependencyMap(nodes: FabricNode[]): Record<string, string[]> {
  return Object.fromEntries(nodes.map((node) => [node.id, [...new Set(node.dependsOn)].sort()]));
}

function countOwnedFiles(nodes: FabricNode[]): number {
  return new Set(nodes.flatMap((node) => node.owns)).size;
}

async function readPreviousGraph(projectRoot: string): Promise<FabricGraph | undefined> {
  const graphPath = join(projectRoot, ".fab", "graph.json");
  if (!existsSync(graphPath)) {
    return undefined;
  }

  try {
    return JSON.parse(await readFile(graphPath, "utf8")) as FabricGraph;
  } catch {
    return undefined;
  }
}

async function readProjectName(projectRoot: string): Promise<string> {
  const packagePath = join(projectRoot, "package.json");
  if (!existsSync(packagePath)) {
    return "unknown-project";
  }

  try {
    const packageJson = JSON.parse(await readFile(packagePath, "utf8")) as { name?: string };
    return packageJson.name ?? "unknown-project";
  } catch {
    return "unknown-project";
  }
}
