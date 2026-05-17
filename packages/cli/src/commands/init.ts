import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { defaultConfig, type FabricGraph } from "@khai93/fabric-core";

export async function initCommand(projectRoot = process.cwd()): Promise<void> {
  const fabDirectory = join(projectRoot, ".fab");
  await mkdir(join(fabDirectory, "nodes"), { recursive: true });
  await mkdir(join(fabDirectory, "summaries"), { recursive: true });
  await mkdir(join(fabDirectory, "evidence"), { recursive: true });

  await writeFile(join(fabDirectory, "FAB.md"), fabMd());
  await writeFile(join(fabDirectory, "config.json"), `${JSON.stringify(defaultConfig, null, 2)}\n`);

  const packageJsonPath = join(projectRoot, "package.json");
  const projectName = existsSync(packageJsonPath)
    ? ((await import(packageJsonPath, { with: { type: "json" } })).default.name ?? "unknown-project")
    : "unknown-project";

  const emptyGraph: FabricGraph = {
    version: "0.3.0",
    generatedAt: new Date(0).toISOString(),
    projectRoot,
    projectName,
    filesScanned: 0,
    nodes: [],
    edges: [],
    warnings: ["Run `fabric scan` to populate the architecture graph."]
  };

  await writeFile(join(fabDirectory, "graph.json"), `${JSON.stringify(emptyGraph, null, 2)}\n`);
  await writeFile(join(fabDirectory, "ownership-map.json"), `${JSON.stringify({}, null, 2)}\n`);
  await writeFile(join(fabDirectory, "dependency-map.json"), `${JSON.stringify({}, null, 2)}\n`);

  console.log("Initialized .fab overlay.");
}

function fabMd(): string {
  return `# FAB.md

Rules for AI agents using this repository:

- Files remain the source of truth.
- Nodes are semantic architecture overlays, not replacement source files.
- Search existing nodes before creating new ones.
- Do not duplicate capabilities.
- Update node summaries after code changes.
- Every node claim should trace back to owned files or code evidence.
- The .fab directory is generated overlay output.
`;
}
