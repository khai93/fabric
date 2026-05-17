import { basename, dirname, extname, posix } from "node:path";
import type { FabricEdge, FabricNode, FabricNodeType } from "../graph/types";
import type { ScanResult, SourceFileInfo } from "../scanner/scanRepo";

export interface InferredGraphParts {
  nodes: FabricNode[];
  edges: FabricEdge[];
  fileToNodeId: Map<string, string>;
}

const folderTypeMap: Record<string, FabricNodeType> = {
  services: "service",
  service: "service",
  routes: "route",
  route: "route",
  controllers: "controller",
  controller: "controller",
  middleware: "middleware",
  middlewares: "middleware",
  repositories: "repository",
  repository: "repository",
  models: "model",
  model: "model",
  components: "component",
  component: "component",
  commands: "workflow",
  config: "utility",
  graph: "workflow",
  nodes: "workflow",
  scanner: "workflow",
  summaries: "utility",
  utils: "utility",
  util: "utility",
  utilities: "utility",
  systems: "workflow",
  workflows: "workflow"
};

export function inferNodes(scan: ScanResult): InferredGraphParts {
  const nodeMap = new Map<string, FabricNode>();
  const fileToNodeId = new Map<string, string>();
  const warnings: string[] = [];

  for (const file of scan.files) {
    const inferred = inferNodeForFile(file);
    const node = ensureNode(nodeMap, inferred.id, inferred.name, inferred.type);
    node.owns.push(file.path);
    node.tags = sortedUnique([...(node.tags ?? []), inferred.tag]);
    node.evidence = [
      ...(node.evidence ?? []),
      {
        file: file.path,
        reason: inferred.reason
      }
    ];
    fileToNodeId.set(file.path, node.id);

    if (inferred.type === "unknown") {
      warnings.push(`Could not confidently infer a node type for ${file.path}.`);
    }

    for (const route of file.routes) {
      const routeName = titleFromId(route.idHint);
      const routeNode = ensureNode(nodeMap, route.idHint, routeName, "route");
      routeNode.owns.push(file.path);
      routeNode.tags = sortedUnique([...(routeNode.tags ?? []), "route", route.method ?? "mount"]);
      routeNode.evidence = [
        ...(routeNode.evidence ?? []),
        {
          file: file.path,
          startLine: route.line,
          endLine: route.line,
          reason: `Detected Express-style ${route.method ? `${route.method.toUpperCase()} ` : ""}route pattern for ${route.path}.`
        }
      ];
    }
  }

  const edges = buildEdges(scan.files, fileToNodeId, nodeMap);
  const nodes = Array.from(nodeMap.values()).map((node) => normalizeNode(node, edges));

  for (const warning of warnings) {
    if (!scan.warnings.includes(warning)) {
      scan.warnings.push(warning);
    }
  }

  return {
    nodes: nodes.sort((a, b) => a.id.localeCompare(b.id)),
    edges: edges.sort(compareEdges),
    fileToNodeId
  };
}

function inferNodeForFile(file: SourceFileInfo): { id: string; name: string; type: FabricNodeType; tag: string; reason: string } {
  if (file.isTest) {
    const capability = cleanCapabilityName(basenameWithoutExtensions(file.path).replace(/\.(test|spec)$/i, ""));
    return {
      id: `test.${capability}`,
      name: `${toTitle(capability)} Test`,
      type: "test",
      tag: capability,
      reason: "File path or extension indicates a test file."
    };
  }

  const parts = file.path.split("/");
  const directoryParts = dirname(file.path).split("/").filter(Boolean);
  const matchedFolder = [...directoryParts].reverse().find((part) => folderTypeMap[part.toLowerCase()]);
  const type = matchedFolder ? folderTypeMap[matchedFolder.toLowerCase()] : inferTypeFromFilename(file.path);
  const capability = cleanCapabilityName(stripKnownSuffixes(basenameWithoutExtensions(file.path)));
  const nodeType = type ?? "unknown";

  return {
    id: `${nodeType}.${capability}`,
    name: `${toTitle(capability)} ${typeLabel(nodeType)}`.trim(),
    type: nodeType,
    tag: capability,
    reason: matchedFolder
      ? `Folder name "${matchedFolder}" indicates ${nodeType} ownership.`
      : parts.length <= 2
        ? "Top-level source file was grouped as an app node."
        : "No strong convention matched; grouped as an unknown capability."
  };
}

function inferTypeFromFilename(filePath: string): FabricNodeType | undefined {
  const lower = basename(filePath).toLowerCase();
  if (lower.includes(".service.")) return "service";
  if (lower.includes(".route.") || lower.includes(".routes.")) return "route";
  if (lower.includes(".controller.")) return "controller";
  if (lower.includes(".middleware.")) return "middleware";
  if (lower.includes(".repository.") || lower.includes(".repo.")) return "repository";
  if (lower.includes(".model.")) return "model";
  if (lower.endsWith(".d.ts")) return "utility";
  if (lower.endsWith(".tsx") || lower.endsWith(".jsx")) return "component";
  if (/^(index|main|app|server)\.[cm]?[jt]sx?$/.test(lower)) return "app";
  return undefined;
}

function buildEdges(files: SourceFileInfo[], fileToNodeId: Map<string, string>, nodeMap: Map<string, FabricNode>): FabricEdge[] {
  const edges: FabricEdge[] = [];
  const knownFiles = new Set(files.map((file) => file.path));

  for (const file of files) {
    const from = fileToNodeId.get(file.path);
    if (!from) continue;

    for (const detectedImport of file.imports) {
      const importedPath = resolveRelativeImport(file.path, detectedImport.specifier, knownFiles);
      if (!importedPath) continue;

      const to = fileToNodeId.get(importedPath);
      if (!to || to === from) continue;

      edges.push({
        from,
        to,
        type: "imports",
        evidence: [{
          file: file.path,
          startLine: detectedImport.line,
          endLine: detectedImport.line,
          reason: `Imports ${detectedImport.specifier}.`
        }]
      });
    }

    for (const route of file.routes) {
      edges.push({
        from: route.idHint,
        to: from,
        type: "owns",
        evidence: [{
          file: file.path,
          startLine: route.line,
          endLine: route.line,
          reason: "Route node is backed by this source file."
        }]
      });

      for (const serviceNode of obviousServiceImports(file, files, fileToNodeId, nodeMap)) {
        edges.push({
          from: route.idHint,
          to: serviceNode,
          type: "route_to_service",
          evidence: [{
            file: file.path,
            startLine: route.line,
            endLine: route.line,
            reason: "Route file imports an inferred service node."
          }]
        });
      }
    }
  }

  return dedupeEdges(edges);
}

function obviousServiceImports(file: SourceFileInfo, files: SourceFileInfo[], fileToNodeId: Map<string, string>, nodeMap: Map<string, FabricNode>): string[] {
  const knownFiles = new Set(files.map((sourceFile) => sourceFile.path));
  const serviceNodeIds = new Set<string>();

  for (const detectedImport of file.imports) {
    const importedPath = resolveRelativeImport(file.path, detectedImport.specifier, knownFiles);
    if (!importedPath) continue;
    const nodeId = fileToNodeId.get(importedPath);
    if (nodeId && nodeMap.get(nodeId)?.type === "service") {
      serviceNodeIds.add(nodeId);
    }
  }

  return [...serviceNodeIds].sort();
}

function normalizeNode(node: FabricNode, edges: FabricEdge[]): FabricNode {
  const dependsOn = sortedUnique(edges.filter((edge) => edge.from === node.id && edge.to !== node.id).map((edge) => edge.to));
  const owns = sortedUnique(node.owns);
  const description = node.description ?? defaultDescription(node.type, node.tags?.[0] ?? node.name);

  return {
    ...node,
    description,
    owns,
    dependsOn,
    tags: sortedUnique(node.tags ?? []),
    summaryPath: `.fab/summaries/${node.id}.summary.md`,
    evidence: sortEvidence(node.evidence ?? [])
  };
}

function ensureNode(nodeMap: Map<string, FabricNode>, id: string, name: string, type: FabricNodeType): FabricNode {
  const existing = nodeMap.get(id);
  if (existing) return existing;

  const node: FabricNode = {
    id,
    name,
    type,
    owns: [],
    dependsOn: []
  };
  nodeMap.set(id, node);
  return node;
}

function resolveRelativeImport(fromFile: string, specifier: string, knownFiles: Set<string>): string | undefined {
  if (!specifier.startsWith(".")) return undefined;

  const base = posix.normalize(posix.join(posix.dirname(fromFile), specifier));
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    `${base}.jsx`,
    `${base}.mjs`,
    `${base}.cjs`,
    `${base}/index.ts`,
    `${base}/index.tsx`,
    `${base}/index.js`,
    `${base}/index.jsx`
  ];

  return candidates.find((candidate) => knownFiles.has(candidate));
}

function dedupeEdges(edges: FabricEdge[]): FabricEdge[] {
  const map = new Map<string, FabricEdge>();
  for (const edge of edges) {
    const key = `${edge.from}\0${edge.to}\0${edge.type}`;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, edge);
      continue;
    }
    existing.evidence = sortEvidence([...(existing.evidence ?? []), ...(edge.evidence ?? [])]);
  }
  return [...map.values()].sort(compareEdges);
}

function compareEdges(a: FabricEdge, b: FabricEdge): number {
  return a.from.localeCompare(b.from) || a.to.localeCompare(b.to) || a.type.localeCompare(b.type);
}

function sortEvidence(evidence: NonNullable<FabricNode["evidence"]>): NonNullable<FabricNode["evidence"]> {
  return evidence.sort((a, b) => a.file.localeCompare(b.file) || (a.startLine ?? 0) - (b.startLine ?? 0) || a.reason.localeCompare(b.reason));
}

function sortedUnique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort();
}

function basenameWithoutExtensions(filePath: string): string {
  let name = basename(filePath, extname(filePath));
  name = basename(name, extname(name));
  return name;
}

function stripKnownSuffixes(value: string): string {
  return value.replace(/\.(service|routes?|controller|middleware|repository|repo|model|component|util|utils)$/i, "");
}

function cleanCapabilityName(value: string): string {
  const cleaned = value
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[^a-zA-Z0-9]+/g, ".")
    .replace(/\.+/g, ".")
    .replace(/^\.+|\.+$/g, "")
    .toLowerCase();
  return cleaned || "root";
}

function toTitle(value: string): string {
  return value.split(".").filter(Boolean).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

function titleFromId(id: string): string {
  const [, ...rest] = id.split(".");
  return `${toTitle(rest.join("."))} Route`;
}

function typeLabel(type: FabricNodeType): string {
  return type === "unknown" ? "" : toTitle(type);
}

function defaultDescription(type: FabricNodeType, tag: string): string {
  const capability = toTitle(tag);
  switch (type) {
    case "app":
      return `Coordinates application entrypoint behavior for ${capability}.`;
    case "service":
      return `Handles ${capability}-related business logic.`;
    case "route":
      return `Defines ${capability}-related routing behavior.`;
    case "controller":
      return `Coordinates ${capability}-related request handling.`;
    case "middleware":
      return `Provides ${capability}-related middleware behavior.`;
    case "repository":
      return `Handles ${capability}-related data access.`;
    case "model":
      return `Defines ${capability}-related data structures.`;
    case "component":
      return `Provides the ${capability} UI component.`;
    case "utility":
      return `Provides ${capability}-related helper utilities.`;
    case "test":
      return `Covers ${capability}-related behavior with tests.`;
    case "workflow":
      return `Coordinates ${capability}-related workflow behavior.`;
    default:
      return `Represents inferred ${capability}-related code.`;
  }
}
