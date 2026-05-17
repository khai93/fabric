import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { readGraph } from "@khai93/fabric-core";

export async function statusCommand(projectRoot = process.cwd()): Promise<void> {
  const fabDirectory = join(projectRoot, ".fab");
  const hasFab = existsSync(fabDirectory);
  const missing = ["graph.json", "ownership-map.json", "dependency-map.json"]
    .filter((file) => !existsSync(join(fabDirectory, file)));

  if (!hasFab) {
    console.log("Project: unknown-project");
    console.log(".fab exists: no");
    console.log("Source files scanned: 0");
    console.log("Nodes generated: 0");
    console.log("Dependency edges: 0");
    console.log("Summaries: 0");
    console.log("Warning: .fab directory is missing. Run `fabric init`.");
    return;
  }

  if (missing.includes("graph.json")) {
    console.log("Project: unknown-project");
    console.log(".fab exists: yes");
    console.log("Source files scanned: 0");
    console.log("Nodes generated: 0");
    console.log("Dependency edges: 0");
    console.log("Summaries: 0");
    for (const file of missing) {
      console.log(`Warning: .fab/${file} is missing.`);
    }
    return;
  }

  const graph = await readGraph(projectRoot);
  const summariesDirectory = join(fabDirectory, "summaries");
  const summaryCount = existsSync(summariesDirectory)
    ? (await readdir(summariesDirectory)).filter((file) => file.endsWith(".summary.md")).length
    : 0;
  const dependencyEdges = graph.edges.filter((edge) => edge.type === "imports" || edge.type === "depends_on" || edge.type === "route_to_service").length;

  console.log(`Project: ${graph.projectName}`);
  console.log(".fab exists: yes");
  console.log(`Source files scanned: ${graph.filesScanned}`);
  console.log(`Nodes generated: ${graph.nodes.length}`);
  console.log(`Dependency edges: ${dependencyEdges}`);
  console.log(`Summaries: ${summaryCount}`);

  for (const file of missing) {
    console.log(`Warning: .fab/${file} is missing.`);
  }

  for (const warning of graph.warnings ?? []) {
    console.log(`Warning: ${warning}`);
  }
}
