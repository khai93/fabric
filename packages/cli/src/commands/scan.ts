import { existsSync } from "node:fs";
import { join } from "node:path";
import { buildGraph, scanRepo, writeEvidence, writeGraph } from "@khai93/fabric-core";
import { initCommand } from "./init";

export async function scanCommand(projectRoot = process.cwd()): Promise<void> {
  if (!existsSync(join(projectRoot, ".fab"))) {
    await initCommand(projectRoot);
  }

  const scan = await scanRepo(projectRoot);
  const graph = buildGraph(scan);
  await writeGraph(projectRoot, graph);
  await writeEvidence(projectRoot, scan, graph);

  console.log(`Scanned ${graph.filesScanned} source file(s).`);
  console.log(`Generated ${graph.nodes.length} node(s) and ${graph.edges.length} edge(s).`);
  console.log("Wrote .fab/evidence facts.");
}
