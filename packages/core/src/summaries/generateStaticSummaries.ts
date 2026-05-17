import type { FabricNode } from "../graph/types";

export function generateStaticSummary(node: FabricNode): string {
  const dependencies = node.dependsOn.length > 0
    ? node.dependsOn.map((dependency) => `- ${dependency}`).join("\n")
    : "- None detected";

  const ownedFiles = node.owns.length > 0
    ? node.owns.map((file) => `- ${file}`).join("\n")
    : "- None detected";

  const evidence = (node.evidence ?? []).length > 0
    ? (node.evidence ?? []).map((item) => {
      const line = item.startLine ? `:${item.startLine}` : "";
      return `- ${item.file}${line}: ${item.reason}`;
    }).join("\n")
    : "- No evidence recorded";

  return `# ${node.name}

## Purpose
${node.description ?? "Static scanner inferred this node from project structure."}

## Owned files
${ownedFiles}

## Dependencies
${dependencies}

## AI notes
- Search this node before creating new ${node.tags?.[0] ?? node.type} logic.
- Expand owned files only when implementation details are needed.
- Files remain the source of truth.

## Evidence
${evidence}
`;
}
