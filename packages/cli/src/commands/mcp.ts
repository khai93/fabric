import { startMcpServer } from "@khai93/fabric-mcp/server";
import { loadFabricProject } from "@khai93/fabric-mcp";

export async function mcpCommand(projectRoot = process.cwd()): Promise<void> {
  console.error("Fabric MCP server starting...");
  console.error(`Project root: ${projectRoot}`);
  console.error(`Looking for graph: ${projectRoot}/.fab/graph.json`);
  const project = await loadFabricProject(projectRoot);
  console.error("Fabric MCP server ready.");
  console.error(`Loaded ${project.graph.nodes.length} nodes and ${project.graph.edges.length} edges.`);
  await startMcpServer(projectRoot);
}
