import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { FabricGraph } from "@fabric/core";

export interface LoadedFabricProject {
  projectRoot: string;
  fabDir: string;
  graphPath: string;
  graph: FabricGraph;
  ownershipMap?: unknown;
  dependencyMap?: unknown;
}

export async function loadFabricProject(cwd: string): Promise<LoadedFabricProject> {
  const projectRoot = cwd;
  const fabDir = join(projectRoot, ".fab");
  const graphPath = join(fabDir, "graph.json");

  if (!existsSync(graphPath)) {
    throw new Error(`Fabric graph not found.
Run \`fabric init\` and \`fabric scan\` first.
Expected: ${graphPath}`);
  }

  const graph = parseGraph(await readJson(graphPath), graphPath);

  return {
    projectRoot,
    fabDir,
    graphPath,
    graph,
    ownershipMap: await readOptionalJson(join(fabDir, "ownership-map.json")),
    dependencyMap: await readOptionalJson(join(fabDir, "dependency-map.json"))
  };
}

async function readJson(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to read Fabric graph: ${message}`);
  }
}

async function readOptionalJson(path: string): Promise<unknown | undefined> {
  if (!existsSync(path)) {
    return undefined;
  }

  try {
    return JSON.parse(await readFile(path, "utf8")) as unknown;
  } catch {
    return undefined;
  }
}

function parseGraph(value: unknown, graphPath: string): FabricGraph {
  if (!isRecord(value) || !Array.isArray(value.nodes) || !Array.isArray(value.edges)) {
    throw new Error(`Invalid Fabric graph at ${graphPath}. Run \`fabric scan\` again.`);
  }

  return value as unknown as FabricGraph;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
