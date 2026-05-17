import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError
} from "@modelcontextprotocol/sdk/types.js";
import { expandNodeCode } from "./tools/expandNodeCode";
import { findDuplicateCapability } from "./tools/findDuplicateCapability";
import { getNeighbors } from "./tools/getNeighbors";
import { getNode } from "./tools/getNode";
import { getOwnedFiles } from "./tools/getOwnedFiles";
import { searchNodes } from "./tools/searchNodes";
import { traceDependencies } from "./tools/traceDependencies";
import { loadFabricProject } from "./utils/loadFabricProject";

const toolNames = {
  searchNodes: "fabric.search_nodes",
  getNode: "fabric.get_node",
  getNeighbors: "fabric.get_neighbors",
  getOwnedFiles: "fabric.get_owned_files",
  expandNodeCode: "fabric.expand_node_code",
  traceDependencies: "fabric.trace_dependencies",
  findDuplicateCapability: "fabric.find_duplicate_capability"
} as const;

export async function startMcpServer(projectRoot = process.cwd()): Promise<void> {
  const server = new Server(
    {
      name: "fabric",
      version: "0.2.0"
    },
    {
      capabilities: {
        tools: {}
      }
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: toolNames.searchNodes,
        description: "Search Fabric architecture nodes by id, name, type, description, tags, owned files, and summaries.",
        inputSchema: {
          type: "object",
          properties: {
            query: { type: "string" },
            limit: { type: "number" }
          },
          required: ["query"]
        }
      },
      {
        name: toolNames.getNode,
        description: "Get one Fabric node and its summary text.",
        inputSchema: {
          type: "object",
          properties: {
            id: { type: "string" }
          },
          required: ["id"]
        }
      },
      {
        name: toolNames.getNeighbors,
        description: "Return directly connected Fabric nodes at depth 1 or 2.",
        inputSchema: {
          type: "object",
          properties: {
            id: { type: "string" },
            depth: { type: "number", enum: [1, 2] },
            direction: { type: "string", enum: ["incoming", "outgoing", "both"] }
          },
          required: ["id"]
        }
      },
      {
        name: toolNames.getOwnedFiles,
        description: "Return source files owned by a Fabric node.",
        inputSchema: {
          type: "object",
          properties: {
            id: { type: "string" }
          },
          required: ["id"]
        }
      },
      {
        name: toolNames.expandNodeCode,
        description: "Return bounded source code from files owned by a Fabric node.",
        inputSchema: {
          type: "object",
          properties: {
            id: { type: "string" },
            maxBytes: { type: "number" }
          },
          required: ["id"]
        }
      },
      {
        name: toolNames.traceDependencies,
        description: "Find a dependency path between two Fabric node IDs using BFS.",
        inputSchema: {
          type: "object",
          properties: {
            from: { type: "string" },
            to: { type: "string" },
            maxDepth: { type: "number" }
          },
          required: ["from", "to"]
        }
      },
      {
        name: toolNames.findDuplicateCapability,
        description: "Find existing Fabric nodes that may already implement a requested capability.",
        inputSchema: {
          type: "object",
          properties: {
            query: { type: "string" },
            limit: { type: "number" }
          },
          required: ["query"]
        }
      }
    ]
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const args = (request.params.arguments ?? {}) as Record<string, unknown>;

    try {
      const project = await loadFabricProject(projectRoot);
      const result = await callTool(request.params.name, project, args);
      return {
        content: [
          {
            type: "text",
            text: `${JSON.stringify(result, null, 2)}\n`
          }
        ]
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new McpError(ErrorCode.InvalidRequest, message);
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

async function callTool(name: string, project: Awaited<ReturnType<typeof loadFabricProject>>, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case toolNames.searchNodes:
      return searchNodes(project, { query: requireString(args.query, "query"), limit: optionalNumber(args.limit, "limit") });
    case toolNames.getNode:
      return getNode(project, { id: requireString(args.id, "id") });
    case toolNames.getNeighbors:
      return getNeighbors(project, {
        id: requireString(args.id, "id"),
        depth: optionalNumber(args.depth, "depth"),
        direction: optionalDirection(args.direction)
      });
    case toolNames.getOwnedFiles:
      return getOwnedFiles(project, { id: requireString(args.id, "id") });
    case toolNames.expandNodeCode:
      return expandNodeCode(project, { id: requireString(args.id, "id"), maxBytes: optionalNumber(args.maxBytes, "maxBytes") });
    case toolNames.traceDependencies:
      return traceDependencies(project, {
        from: requireString(args.from, "from"),
        to: requireString(args.to, "to"),
        maxDepth: optionalNumber(args.maxDepth, "maxDepth")
      });
    case toolNames.findDuplicateCapability:
      return findDuplicateCapability(project, { query: requireString(args.query, "query"), limit: optionalNumber(args.limit, "limit") });
    default:
      throw new Error(`Unknown Fabric MCP tool: ${name}`);
  }
}

function requireString(value: unknown, name: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Expected non-empty string argument: ${name}`);
  }

  return value;
}

function optionalNumber(value: unknown, name: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Expected numeric argument: ${name}`);
  }

  return value;
}

function optionalDirection(value: unknown): "incoming" | "outgoing" | "both" | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === "incoming" || value === "outgoing" || value === "both") {
    return value;
  }

  throw new Error("Expected direction to be incoming, outgoing, or both.");
}
