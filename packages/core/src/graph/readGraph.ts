import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { FabricGraph } from "./types";

export async function readGraph(projectRoot: string): Promise<FabricGraph> {
  return JSON.parse(await readFile(join(projectRoot, ".fab", "graph.json"), "utf8")) as FabricGraph;
}
