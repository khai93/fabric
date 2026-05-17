import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

export async function generateCommand(args: string[], projectRoot = process.cwd()): Promise<void> {
  if (!args.includes("--prompt")) {
    throw new Error("Only `fab generate --prompt` is supported in v0.3.");
  }

  const promptsDirectory = join(projectRoot, ".fab", "prompts");
  await mkdir(promptsDirectory, { recursive: true });
  const promptPath = join(promptsDirectory, "generate-nodes.md");
  await writeFile(promptPath, fallbackPrompt());
  console.log("Wrote .fab/prompts/generate-nodes.md.");
  console.log("Prefer MCP-assisted generation when a Fabric MCP server is available.");
}

function fallbackPrompt(): string {
  return `# Generate Fabric Semantic Nodes

Prefer Fabric MCP tools when available. Do not use this prompt as the primary workflow if the client can connect to the Fabric MCP server.

Primary workflow:

1. Call \`fabric.get_repo_context\`.
2. Call \`fabric.list_evidence_files\`.
3. Read evidence with \`fabric.get_evidence\`.
4. Call \`fabric.get_node_schema\`.
5. Generate capability-level architecture nodes.
6. Before writing, call \`fabric.list_nodes\` to avoid duplicates.
7. Write nodes using \`fabric.write_node\`.
8. Write summaries using \`fabric.write_summary\`.
9. Call \`fabric.rebuild_graph\`.
10. Call \`fabric.validate\`.
11. If validation fails, fix nodes and validate again.

Rules:

- Source files remain source of truth.
- Do not move source files.
- Do not edit application code unless the user explicitly asks.
- Do not create one node per tiny function.
- Prefer service/workflow/component/system/repository/route-level nodes.
- Every node must cite evidence.
- Every owned file must exist in evidence.
- Preserve stable node IDs.
`;
}
