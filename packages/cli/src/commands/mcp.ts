import { startMcpServer } from "@fabric/mcp/server";
import { loadFabricProject } from "@fabric/mcp";

export async function mcpCommand(projectRoot = process.cwd()): Promise<void> {
  await loadFabricProject(projectRoot);
  await startMcpServer(projectRoot);
}
