import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { FabricGraph } from "./types";
import { writeNodes } from "../nodes/writeNodes";

export async function writeGraph(projectRoot: string, graph: FabricGraph): Promise<void> {
  const fabDirectory = join(projectRoot, ".fab");
  await mkdir(fabDirectory, { recursive: true });

  await writeFile(join(fabDirectory, "graph.json"), `${JSON.stringify(graph, null, 2)}\n`);
  await writeFile(join(fabDirectory, "ownership-map.json"), `${JSON.stringify(buildOwnershipMap(graph), null, 2)}\n`);
  await writeFile(join(fabDirectory, "dependency-map.json"), `${JSON.stringify(buildDependencyMap(graph), null, 2)}\n`);
  await writeNodes(projectRoot, graph.nodes);
}

function buildOwnershipMap(graph: FabricGraph): Record<string, string[]> {
  return Object.fromEntries(
    [...graph.nodes]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((node) => [node.id, [...node.owns].sort()])
  );
}

function buildDependencyMap(graph: FabricGraph): Record<string, string[]> {
  return Object.fromEntries(
    [...graph.nodes]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((node) => [node.id, [...node.dependsOn].sort()])
  );
}
