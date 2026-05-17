import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { readNodeFiles } from "../nodes/readNodes";

export interface FabricValidationIssue {
  code: string;
  message: string;
  nodeId?: string;
  file?: string;
}

export interface FabricValidationResult {
  ok: boolean;
  errorCount: number;
  warningCount: number;
  errors: FabricValidationIssue[];
  warnings: FabricValidationIssue[];
}

export async function validateFabric(projectRoot: string): Promise<FabricValidationResult> {
  const errors: FabricValidationIssue[] = [];
  const warnings: FabricValidationIssue[] = [];
  const nodes = await readNodeFiles(projectRoot);
  const nodeIds = new Set(nodes.map((node) => node.id));
  const evidenceFiles = await readEvidenceFiles(projectRoot);

  for (const node of nodes) {
    for (const dependency of node.dependsOn) {
      if (!nodeIds.has(dependency)) {
        errors.push({
          code: "UNKNOWN_DEPENDENCY",
          message: `Node ${node.id} depends on missing node ${dependency}`,
          nodeId: node.id
        });
      }
    }

    for (const ownedFile of node.owns) {
      if (!evidenceFiles.has(ownedFile)) {
        errors.push({
          code: "MISSING_OWNED_FILE",
          message: `Node ${node.id} owns missing file ${ownedFile}`,
          nodeId: node.id,
          file: ownedFile
        });
      }
    }

    const summaryPath = node.summaryPath ?? `.fab/summaries/${node.id}.summary.md`;
    if (!existsSync(join(projectRoot, summaryPath))) {
      warnings.push({
        code: "MISSING_SUMMARY",
        message: `Node ${node.id} has no summary file`,
        nodeId: node.id
      });
    }

    if (!node.evidence || node.evidence.length === 0) {
      warnings.push({
        code: "MISSING_EVIDENCE",
        message: `Node ${node.id} has no evidence entries`,
        nodeId: node.id
      });
    }
  }

  return {
    ok: errors.length === 0,
    errorCount: errors.length,
    warningCount: warnings.length,
    errors,
    warnings
  };
}

async function readEvidenceFiles(projectRoot: string): Promise<Set<string>> {
  const filesPath = join(projectRoot, ".fab", "evidence", "files.json");
  if (!existsSync(filesPath)) {
    return new Set();
  }

  try {
    const files = JSON.parse(await readFile(filesPath, "utf8")) as Array<{ path?: string }>;
    return new Set(files.map((file) => file.path).filter((path): path is string => typeof path === "string"));
  } catch {
    return new Set();
  }
}
