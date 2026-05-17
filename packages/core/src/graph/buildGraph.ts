import type { FabricGraph } from "./types";
import { inferNodes } from "../nodes/inferNodes";
import type { ScanResult } from "../scanner/scanRepo";

export function buildGraph(scan: ScanResult): FabricGraph {
  const inferred = inferNodes(scan);

  return {
    version: "0.3.0",
    generatedAt: new Date(0).toISOString(),
    projectRoot: scan.projectRoot,
    projectName: scan.packageInfo.name,
    filesScanned: scan.files.length,
    nodes: inferred.nodes,
    edges: inferred.edges,
    warnings: [...scan.warnings].sort()
  };
}
