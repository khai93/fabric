import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { FabricNode } from "@khai93/fabric-core";
import type { LoadedFabricProject } from "../utils/loadFabricProject";

export interface GetNodeInput {
  id: string;
}

export async function getNode(project: LoadedFabricProject, input: GetNodeInput): Promise<{
  node: FabricNode;
  summary: string;
}> {
  const node = project.graph.nodes.find((candidate) => candidate.id === input.id);
  if (!node) {
    throw new Error(`Fabric node not found: ${input.id}`);
  }

  return {
    node,
    summary: await readSummary(project, node)
  };
}

async function readSummary(project: LoadedFabricProject, node: FabricNode): Promise<string> {
  if (!node.summaryPath) {
    return "";
  }

  const summaryPath = join(project.projectRoot, node.summaryPath);
  if (!existsSync(summaryPath)) {
    return "";
  }

  try {
    return await readFile(summaryPath, "utf8");
  } catch {
    return "";
  }
}
