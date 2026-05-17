import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { FabricGraph, FabricNode } from "../graph/types";
import type { ScanResult, SourceFileInfo } from "../scanner/scanRepo";

export async function writeEvidence(projectRoot: string, scan: ScanResult, graph: FabricGraph): Promise<void> {
  const evidenceDirectory = join(projectRoot, ".fab", "evidence");
  await mkdir(evidenceDirectory, { recursive: true });

  await writeEvidenceJson(projectRoot, "files", scan.files.map((file) => ({
    path: file.path,
    isTest: file.isTest,
    importCount: file.imports.length,
    exportCount: file.exports.length,
    routeCount: file.routes.length
  })));
  await writeEvidenceJson(projectRoot, "imports", scan.files.flatMap((file) => file.imports.map((item) => ({ file: file.path, ...item }))));
  await writeEvidenceJson(projectRoot, "symbols", scan.files.flatMap((file) => file.exports.map((item) => ({ file: file.path, ...item }))));
  await writeEvidenceJson(projectRoot, "routes", scan.files.flatMap((file) => file.routes.map((item) => ({ file: file.path, ...item }))));
  await writeEvidenceJson(projectRoot, "tests", scan.files.filter((file) => file.isTest).map((file) => ({ path: file.path })));
  await writeEvidenceJson(projectRoot, "package", scan.packageInfo);
  await writeExistingNodesEvidence(projectRoot, graph.nodes);
  await writeEvidenceJson(projectRoot, "repo-context", repoContextEvidence(scan, graph));
}

export async function writeExistingNodesEvidence(projectRoot: string, nodes: FabricNode[]): Promise<void> {
  await writeEvidenceJson(projectRoot, "existing-nodes", nodes.map((node) => ({
    id: node.id,
    name: node.name,
    type: node.type,
    owns: [...node.owns].sort(),
    dependsOn: [...node.dependsOn].sort(),
    summaryPath: node.summaryPath
  })));
}

async function writeEvidenceJson(projectRoot: string, name: string, value: unknown): Promise<void> {
  const evidenceDirectory = join(projectRoot, ".fab", "evidence");
  await mkdir(evidenceDirectory, { recursive: true });
  await writeFile(join(evidenceDirectory, `${name}.json`), `${JSON.stringify(value, null, 2)}\n`);
}

function repoContextEvidence(scan: ScanResult, graph: FabricGraph): Record<string, unknown> {
  return {
    projectName: graph.projectName,
    projectRoot: scan.projectRoot,
    sourceFileCount: scan.files.length,
    nodeCount: graph.nodes.length,
    edgeCount: graph.edges.length,
    languages: detectLanguages(scan.files),
    packageManager: existsSync(join(scan.projectRoot, "bun.lock")) ? "bun" : "unknown",
    warnings: scan.warnings
  };
}

function detectLanguages(files: SourceFileInfo[]): string[] {
  const languages = new Set<string>();
  for (const file of files) {
    if (file.path.endsWith(".ts") || file.path.endsWith(".tsx")) languages.add("typescript");
    if (file.path.endsWith(".js") || file.path.endsWith(".jsx") || file.path.endsWith(".mjs") || file.path.endsWith(".cjs")) languages.add("javascript");
  }
  return [...languages].sort();
}
