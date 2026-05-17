import { existsSync } from "node:fs";
import { mkdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import { basename, join, posix } from "node:path";
import {
  readNodeFiles,
  rebuildGraphFromNodeFiles,
  validateFabric,
  type FabricNode,
  type FabricNodeType
} from "@khai93/fabric-core";
import type { LoadedFabricProject } from "../utils/loadFabricProject";

export const validNodeTypes: FabricNodeType[] = [
  "app",
  "service",
  "route",
  "controller",
  "middleware",
  "repository",
  "model",
  "component",
  "utility",
  "test",
  "workflow",
  "unknown"
];

const allowedEvidenceNames = {
  files: "files.json",
  imports: "imports.json",
  symbols: "symbols.json",
  routes: "routes.json",
  tests: "tests.json",
  package: "package.json",
  existingNodes: "existing-nodes.json",
  repoContext: "repo-context.json"
} as const;

export async function getRepoContext(project: LoadedFabricProject): Promise<Record<string, unknown>> {
  const filesEvidence = await readJsonArray(join(project.fabDir, "evidence", "files.json"));
  const importantFiles = ["package.json", "AGENTS.md", "README.md", "packages/cli/src/index.ts"]
    .filter((file) => existsSync(join(project.projectRoot, file)));

  return {
    projectName: project.graph.projectName,
    projectRoot: project.projectRoot,
    fabricVersion: "0.3.0",
    sourceFileCount: filesEvidence?.length ?? project.graph.filesScanned,
    nodeCount: project.graph.nodes.length,
    edgeCount: project.graph.edges.length,
    languages: detectLanguages(filesEvidence),
    packageManager: existsSync(join(project.projectRoot, "bun.lock")) ? "bun" : "unknown",
    importantFiles,
    evidenceAvailable: {
      files: existsSync(join(project.fabDir, "evidence", "files.json")),
      imports: existsSync(join(project.fabDir, "evidence", "imports.json")),
      symbols: existsSync(join(project.fabDir, "evidence", "symbols.json")),
      routes: existsSync(join(project.fabDir, "evidence", "routes.json")),
      tests: existsSync(join(project.fabDir, "evidence", "tests.json")),
      package: existsSync(join(project.fabDir, "evidence", "package.json")),
      existingNodes: existsSync(join(project.fabDir, "evidence", "existing-nodes.json"))
    },
    recommendedWorkflow: [
      "Call fabric.list_evidence_files",
      "Call fabric.get_evidence for relevant evidence",
      "Call fabric.list_nodes",
      "Call fabric.write_node for proposed semantic nodes",
      "Call fabric.write_summary for each node",
      "Call fabric.rebuild_graph",
      "Call fabric.validate"
    ]
  };
}

export async function listEvidenceFiles(project: LoadedFabricProject): Promise<Record<string, unknown>> {
  const evidenceDirectory = join(project.fabDir, "evidence");
  if (!existsSync(evidenceDirectory)) {
    return {
      ok: false,
      error: "Fabric evidence not found. Run `fab scan` first."
    };
  }

  return {
    files: await Promise.all(Object.entries(allowedEvidenceNames).map(async ([name, fileName]) => {
      const path = join(evidenceDirectory, fileName);
      return {
        name,
        path: `.fab/evidence/${fileName}`,
        exists: existsSync(path),
        sizeBytes: existsSync(path) ? (await stat(path)).size : 0
      };
    }))
  };
}

export async function getEvidence(project: LoadedFabricProject, input: { name: string; maxBytes?: number }): Promise<Record<string, unknown>> {
  if (!isAllowedEvidenceName(input.name)) {
    return {
      ok: false,
      errors: [{ code: "INVALID_EVIDENCE_NAME", message: `Unknown evidence name: ${input.name}` }]
    };
  }

  const maxBytes = Math.min(input.maxBytes ?? 50_000, 200_000);
  const relativePath = `.fab/evidence/${allowedEvidenceNames[input.name]}`;
  const path = join(project.projectRoot, relativePath);
  if (!existsSync(path)) {
    return {
      ok: false,
      error: `Evidence file not found: ${relativePath}. Run \`fab scan\` first.`
    };
  }

  const raw = await readFile(path, "utf8");
  const truncated = new TextEncoder().encode(raw).byteLength > maxBytes;
  const text = truncated ? raw.slice(0, maxBytes) : raw;

  try {
    return {
      name: input.name,
      path: relativePath,
      content: JSON.parse(text) as unknown,
      truncated,
      maxBytes
    };
  } catch {
    return {
      name: input.name,
      path: relativePath,
      content: text,
      truncated,
      maxBytes,
      warning: "Evidence content is not valid JSON or was truncated mid-document."
    };
  }
}

export async function listNodes(project: LoadedFabricProject, input: { limit?: number }): Promise<Record<string, unknown>> {
  const limit = Math.min(Math.max(input.limit ?? 100, 1), 1000);
  const nodes = (await readNodeFiles(project.projectRoot)).slice(0, limit).map((node) => ({
    id: node.id,
    name: node.name,
    type: node.type,
    owns: node.owns,
    dependsOn: node.dependsOn,
    summaryPath: node.summaryPath
  }));

  return { nodes };
}

export function getNodeSchema(): Record<string, unknown> {
  return {
    validNodeTypes,
    requiredFields: ["id", "name", "type", "owns", "dependsOn", "evidence"],
    optionalFields: ["description", "inputs", "outputs", "tags", "summaryPath", "confidence", "generatedBy", "warnings", "fileHashes"],
    idNamingRules: [
      "Use lowercase letters, numbers, dot, underscore, and hyphen only.",
      "Prefer stable capability-level IDs such as service.auth or workflow.scan.",
      "Do not include file extensions or source paths in IDs."
    ],
    evidenceRequirements: [
      "Every node should include evidence.",
      "Every owned file must exist in evidence/files.json.",
      "Every dependency should reference another node ID."
    ],
    goodNodes: [
      {
        id: "service.auth",
        name: "Auth Service",
        type: "service",
        owns: ["src/services/auth.ts"],
        dependsOn: ["repository.user"],
        evidence: [{ file: "src/services/auth.ts", reason: "Auth service exports login and session behavior." }]
      }
    ],
    badNodes: [
      {
        id: "function.validate.password.if.branch",
        reason: "Too small. Do not create nodes for every tiny function, variable, if statement, or loop."
      }
    ],
    rules: [
      "Good nodes are capability-level nodes.",
      "Bad nodes are every tiny function, variable, if statement, or loop.",
      "Prefer stable IDs.",
      "Every owned file must exist in evidence/files.json.",
      "Every dependency should reference another node ID.",
      "Every node should include evidence."
    ]
  };
}

export async function writeNode(project: LoadedFabricProject, input: { node: unknown; mode?: string }): Promise<Record<string, unknown>> {
  const mode = input.mode ?? "upsert";
  const validation = await validateNodeInput(project, input.node, mode);
  if (!validation.ok) {
    return validation;
  }

  const node = normalizeNode(validation.node);
  const path = join(project.fabDir, "nodes", `${node.id}.node.json`);
  const exists = existsSync(path);
  if (mode === "create" && exists) {
    return validationFailure("NODE_EXISTS", `Node already exists: ${node.id}`);
  }
  if (mode === "update" && !exists) {
    return validationFailure("NODE_NOT_FOUND", `Node does not exist: ${node.id}`);
  }

  await mkdir(join(project.fabDir, "nodes"), { recursive: true });
  await writeFile(path, `${JSON.stringify(node, null, 2)}\n`);

  return {
    ok: true,
    path: `.fab/nodes/${node.id}.node.json`,
    mode,
    warnings: validation.warnings
  };
}

export async function writeSummary(project: LoadedFabricProject, input: { nodeId: string; summary: string }): Promise<Record<string, unknown>> {
  if (!isSafeNodeId(input.nodeId)) {
    return validationFailure("INVALID_NODE_ID", "Node ID must use lowercase letters, numbers, dot, underscore, or hyphen.");
  }
  if (typeof input.summary !== "string") {
    return validationFailure("INVALID_SUMMARY", "summary must be a string.");
  }

  await mkdir(join(project.fabDir, "summaries"), { recursive: true });
  const relativePath = `.fab/summaries/${input.nodeId}.summary.md`;
  await writeFile(join(project.projectRoot, relativePath), input.summary.endsWith("\n") ? input.summary : `${input.summary}\n`);

  const warnings: string[] = [];
  const nodePath = join(project.fabDir, "nodes", `${input.nodeId}.node.json`);
  if (!existsSync(nodePath)) {
    warnings.push(`Node does not exist yet: ${input.nodeId}`);
  } else {
    const node = JSON.parse(await readFile(nodePath, "utf8")) as FabricNode;
    if (node.summaryPath !== relativePath) {
      node.summaryPath = relativePath;
      await writeFile(nodePath, `${JSON.stringify(normalizeNode(node), null, 2)}\n`);
    }
  }

  return {
    ok: true,
    path: relativePath,
    warnings
  };
}

export async function deleteNode(project: LoadedFabricProject, input: { id: string; deleteSummary?: boolean }): Promise<Record<string, unknown>> {
  if (!isSafeNodeId(input.id)) {
    return validationFailure("INVALID_NODE_ID", "Node ID must use lowercase letters, numbers, dot, underscore, or hyphen.");
  }

  const nodePath = join(project.fabDir, "nodes", `${input.id}.node.json`);
  if (existsSync(nodePath)) {
    await unlink(nodePath);
  }

  if (input.deleteSummary === true) {
    const summaryPath = join(project.fabDir, "summaries", `${input.id}.summary.md`);
    if (existsSync(summaryPath)) {
      await unlink(summaryPath);
    }
  }

  return {
    ok: true,
    path: `.fab/nodes/${input.id}.node.json`,
    deletedSummary: input.deleteSummary === true,
    warnings: ["Graph should be rebuilt with fabric.rebuild_graph."]
  };
}

export async function rebuildGraph(project: LoadedFabricProject): Promise<Record<string, unknown>> {
  return { ...await rebuildGraphFromNodeFiles(project.projectRoot) };
}

export async function validate(project: LoadedFabricProject): Promise<Record<string, unknown>> {
  return { ...await validateFabric(project.projectRoot) };
}

export function getGenerationInstructions(): Record<string, string> {
  return {
    instructions: `Use the Fabric MCP server to generate semantic architecture nodes for this repository.

You are connected to Fabric MCP.

Your task:
1. Call fabric.get_repo_context.
2. Call fabric.list_evidence_files.
3. Read evidence with fabric.get_evidence.
4. Call fabric.get_node_schema.
5. Generate capability-level architecture nodes.
6. Before writing, call fabric.list_nodes to avoid duplicates.
7. Write nodes using fabric.write_node.
8. Write summaries using fabric.write_summary.
9. Call fabric.rebuild_graph.
10. Call fabric.validate.
11. If validation fails, fix nodes and validate again.

Rules:
- Source files remain source of truth.
- Do not move source files.
- Do not edit application code unless the user explicitly asks.
- Do not create one node per tiny function.
- Prefer service/workflow/component/system/repository/route-level nodes.
- Every node must cite evidence.
- Every owned file must exist in evidence.
- Preserve stable node IDs.`
  };
}

function isAllowedEvidenceName(value: string): value is keyof typeof allowedEvidenceNames {
  return Object.prototype.hasOwnProperty.call(allowedEvidenceNames, value);
}

async function validateNodeInput(project: LoadedFabricProject, value: unknown, mode: string): Promise<
  { ok: true; node: FabricNode; warnings: string[] } | { ok: false; errors: Array<{ code: string; message: string }> }
> {
  const errors: Array<{ code: string; message: string }> = [];
  const warnings: string[] = [];

  if (mode !== "create" && mode !== "update" && mode !== "upsert") {
    errors.push({ code: "INVALID_MODE", message: "mode must be create, update, or upsert." });
  }
  if (!isRecord(value)) {
    return { ok: false, errors: [{ code: "INVALID_NODE", message: "node must be an object." }] };
  }

  const node = value as Partial<FabricNode>;
  if (typeof node.id !== "string" || !isSafeNodeId(node.id)) {
    errors.push({ code: "INVALID_NODE_ID", message: "node.id must use lowercase letters, numbers, dot, underscore, or hyphen." });
  }
  if (typeof node.name !== "string" || node.name.trim().length === 0) {
    errors.push({ code: "INVALID_NAME", message: "node.name must be a non-empty string." });
  }
  if (typeof node.type !== "string" || !validNodeTypes.includes(node.type as FabricNodeType)) {
    errors.push({ code: "INVALID_TYPE", message: `node.type must be one of: ${validNodeTypes.join(", ")}.` });
  }
  if (!Array.isArray(node.owns)) {
    errors.push({ code: "INVALID_OWNS", message: "node.owns must be an array." });
  }
  if (!Array.isArray(node.dependsOn)) {
    errors.push({ code: "INVALID_DEPENDS_ON", message: "node.dependsOn must be an array." });
  }

  const evidenceFiles = await readEvidenceFileSet(project);
  for (const ownedFile of node.owns ?? []) {
    if (typeof ownedFile !== "string" || !isSafeRelativePath(ownedFile)) {
      errors.push({ code: "INVALID_OWNED_PATH", message: `Owned path is not safe: ${String(ownedFile)}` });
      continue;
    }
    if (evidenceFiles.size > 0 && !evidenceFiles.has(ownedFile)) {
      errors.push({ code: "OWNED_FILE_NOT_IN_EVIDENCE", message: `Owned file is not listed in evidence/files.json: ${ownedFile}` });
    }
  }

  for (const dependency of node.dependsOn ?? []) {
    if (typeof dependency !== "string" || !isSafeNodeId(dependency)) {
      errors.push({ code: "INVALID_DEPENDENCY_ID", message: `Dependency ID is not safe: ${String(dependency)}` });
    }
  }

  if (node.summaryPath !== undefined && (!isSafeSummaryPath(node.summaryPath) || basename(node.summaryPath) !== `${node.id}.summary.md`)) {
    errors.push({ code: "INVALID_SUMMARY_PATH", message: "summaryPath must be .fab/summaries/<node-id>.summary.md." });
  }

  if (!Array.isArray(node.evidence) || node.evidence.length === 0) {
    warnings.push("Node has no evidence entries.");
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, node: node as FabricNode, warnings };
}

function normalizeNode(node: FabricNode): FabricNode {
  return {
    id: node.id,
    name: node.name,
    type: node.type,
    ...(node.description !== undefined ? { description: node.description } : {}),
    owns: [...new Set(node.owns)].sort(),
    dependsOn: [...new Set(node.dependsOn)].sort(),
    ...(node.inputs !== undefined ? { inputs: node.inputs } : {}),
    ...(node.outputs !== undefined ? { outputs: node.outputs } : {}),
    ...(node.tags !== undefined ? { tags: [...new Set(node.tags)].sort() } : {}),
    summaryPath: node.summaryPath ?? `.fab/summaries/${node.id}.summary.md`,
    ...(node.evidence !== undefined ? { evidence: [...node.evidence].sort((a, b) => a.file.localeCompare(b.file) || a.reason.localeCompare(b.reason)) } : {}),
    ...(node.confidence !== undefined ? { confidence: node.confidence } : {}),
    ...(node.generatedBy !== undefined ? { generatedBy: node.generatedBy } : {}),
    ...(node.warnings !== undefined ? { warnings: [...node.warnings].sort() } : {}),
    ...(node.fileHashes !== undefined ? { fileHashes: node.fileHashes } : {})
  };
}

function validationFailure(code: string, message: string): { ok: false; errors: Array<{ code: string; message: string }> } {
  return { ok: false, errors: [{ code, message }] };
}

function isSafeNodeId(value: string): boolean {
  return /^[a-z0-9._-]+$/.test(value);
}

function isSafeRelativePath(value: string): boolean {
  return value.length > 0 && !value.startsWith("/") && !value.includes("\\") && !value.split("/").includes("..") && posix.normalize(value) === value;
}

function isSafeSummaryPath(value: string): boolean {
  return value.startsWith(".fab/summaries/") && value.endsWith(".summary.md") && isSafeRelativePath(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function readEvidenceFileSet(project: LoadedFabricProject): Promise<Set<string>> {
  const files = await readJsonArray(join(project.fabDir, "evidence", "files.json"));
  return new Set((files ?? []).map((file) => isRecord(file) ? file.path : undefined).filter((path): path is string => typeof path === "string"));
}

async function readJsonArray(path: string): Promise<unknown[] | undefined> {
  if (!existsSync(path)) {
    return undefined;
  }

  try {
    const value = JSON.parse(await readFile(path, "utf8")) as unknown;
    return Array.isArray(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

function detectLanguages(files: unknown[] | undefined): string[] {
  if (!files) {
    return ["typescript"];
  }

  const languages = new Set<string>();
  for (const file of files) {
    if (!isRecord(file) || typeof file.path !== "string") continue;
    if (file.path.endsWith(".ts") || file.path.endsWith(".tsx")) languages.add("typescript");
    if (file.path.endsWith(".js") || file.path.endsWith(".jsx") || file.path.endsWith(".mjs") || file.path.endsWith(".cjs")) languages.add("javascript");
  }
  return [...languages].sort();
}
