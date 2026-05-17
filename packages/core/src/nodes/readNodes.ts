import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { FabricNode } from "../graph/types";

export async function readNodeFiles(projectRoot: string): Promise<FabricNode[]> {
  const nodesDirectory = join(projectRoot, ".fab", "nodes");
  if (!existsSync(nodesDirectory)) {
    return [];
  }

  const nodes: FabricNode[] = [];
  for (const fileName of (await readdir(nodesDirectory)).filter((file) => file.endsWith(".node.json")).sort()) {
    const raw = await readFile(join(nodesDirectory, fileName), "utf8");
    nodes.push(JSON.parse(raw) as FabricNode);
  }

  return nodes.sort((a, b) => a.id.localeCompare(b.id));
}
