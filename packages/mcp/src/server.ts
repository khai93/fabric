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
import { planContext } from "./tools/planContext";
import { searchNodes } from "./tools/searchNodes";
import { traceDependencies } from "./tools/traceDependencies";
import { loadFabricProject } from "./utils/loadFabricProject";
import {
  deleteNode,
  getEvidence,
  getGenerationInstructions,
  getNodeSchema,
  getRepoContext,
  listEvidenceFiles,
  listNodes,
  rebuildGraph,
  validate,
  writeNode,
  writeSummary
} from "./tools/authoring";

const toolNames = {
  searchNodes: "fabric.search_nodes",
  getNode: "fabric.get_node",
  getNeighbors: "fabric.get_neighbors",
  getOwnedFiles: "fabric.get_owned_files",
  planContext: "fabric.plan_context",
  expandNodeCode: "fabric.expand_node_code",
  traceDependencies: "fabric.trace_dependencies",
  findDuplicateCapability: "fabric.find_duplicate_capability",
  getRepoContext: "fabric.get_repo_context",
  listEvidenceFiles: "fabric.list_evidence_files",
  getEvidence: "fabric.get_evidence",
  listNodes: "fabric.list_nodes",
  getNodeSchema: "fabric.get_node_schema",
  writeNode: "fabric.write_node",
  writeSummary: "fabric.write_summary",
  deleteNode: "fabric.delete_node",
  rebuildGraph: "fabric.rebuild_graph",
  validate: "fabric.validate",
  getGenerationInstructions: "fabric.get_generation_instructions"
} as const;

export async function startMcpServer(projectRoot = process.cwd()): Promise<void> {
  const server = new Server(
    {
      name: "fabric",
      version: "0.3.0"
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
            limit: { type: "number" },
            maxOwnedFiles: { type: "number" }
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
            id: { type: "string" },
            maxSummaryBytes: { type: "number" },
            maxOwnedFiles: { type: "number" },
            maxDependsOn: { type: "number" }
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
            direction: { type: "string", enum: ["incoming", "outgoing", "both"] },
            limit: { type: "number" }
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
        name: toolNames.planContext,
        description: "Find the most relevant Fabric nodes for a task and return a compact context plan with suggested next MCP calls.",
        inputSchema: {
          type: "object",
          properties: {
            task: { type: "string" },
            mode: { type: "string", enum: ["plan", "edit", "explain", "review"] },
            limit: { type: "number" },
            maxOwnedFiles: { type: "number" }
          },
          required: ["task"]
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
            limit: { type: "number" },
            maxOwnedFiles: { type: "number" }
          },
          required: ["query"]
        }
      },
      {
        name: toolNames.getRepoContext,
        description: "Return compact repository context and the recommended v0.3 MCP-assisted node generation workflow.",
        inputSchema: { type: "object", properties: {} }
      },
      {
        name: toolNames.listEvidenceFiles,
        description: "List available deterministic evidence files generated by fab scan.",
        inputSchema: { type: "object", properties: {} }
      },
      {
        name: toolNames.getEvidence,
        description: "Read one bounded evidence file from .fab/evidence.",
        inputSchema: {
          type: "object",
          properties: {
            name: { type: "string", enum: ["files", "imports", "symbols", "routes", "tests", "package", "existingNodes", "repoContext"] },
            maxBytes: { type: "number" }
          },
          required: ["name"]
        }
      },
      {
        name: toolNames.listNodes,
        description: "List currently known Fabric semantic nodes.",
        inputSchema: {
          type: "object",
          properties: {
            limit: { type: "number" }
          }
        }
      },
      {
        name: toolNames.getNodeSchema,
        description: "Return Fabric node schema, valid node types, and authoring rules.",
        inputSchema: { type: "object", properties: {} }
      },
      {
        name: toolNames.writeNode,
        description: "Safely create, update, or upsert a Fabric node JSON file in .fab/nodes.",
        inputSchema: {
          type: "object",
          properties: {
            node: { type: "object" },
            mode: { type: "string", enum: ["create", "update", "upsert"] }
          },
          required: ["node"]
        }
      },
      {
        name: toolNames.writeSummary,
        description: "Safely write a markdown summary for a Fabric node in .fab/summaries.",
        inputSchema: {
          type: "object",
          properties: {
            nodeId: { type: "string" },
            summary: { type: "string" }
          },
          required: ["nodeId", "summary"]
        }
      },
      {
        name: toolNames.deleteNode,
        description: "Delete one Fabric node JSON file, optionally deleting its summary only when explicitly requested.",
        inputSchema: {
          type: "object",
          properties: {
            id: { type: "string" },
            deleteSummary: { type: "boolean" }
          },
          required: ["id"]
        }
      },
      {
        name: toolNames.rebuildGraph,
        description: "Rebuild graph, ownership map, dependency map, and existing-node evidence from .fab/nodes.",
        inputSchema: { type: "object", properties: {} }
      },
      {
        name: toolNames.validate,
        description: "Run Fabric validation and return structured errors and warnings.",
        inputSchema: { type: "object", properties: {} }
      },
      {
        name: toolNames.getGenerationInstructions,
        description: "Return ready-to-use instructions for asking an AI client to generate Fabric semantic nodes through MCP.",
        inputSchema: { type: "object", properties: {} }
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
      return searchNodes(project, {
        query: requireString(args.query, "query"),
        limit: optionalNumber(args.limit, "limit"),
        maxOwnedFiles: optionalNumber(args.maxOwnedFiles, "maxOwnedFiles")
      });
    case toolNames.getNode:
      return getNode(project, {
        id: requireString(args.id, "id"),
        maxSummaryBytes: optionalNumber(args.maxSummaryBytes, "maxSummaryBytes"),
        maxOwnedFiles: optionalNumber(args.maxOwnedFiles, "maxOwnedFiles"),
        maxDependsOn: optionalNumber(args.maxDependsOn, "maxDependsOn")
      });
    case toolNames.getNeighbors:
      return getNeighbors(project, {
        id: requireString(args.id, "id"),
        depth: optionalNumber(args.depth, "depth"),
        direction: optionalDirection(args.direction),
        limit: optionalNumber(args.limit, "limit")
      });
    case toolNames.getOwnedFiles:
      return getOwnedFiles(project, { id: requireString(args.id, "id") });
    case toolNames.planContext:
      return planContext(project, {
        task: requireString(args.task, "task"),
        mode: optionalString(args.mode, "mode"),
        limit: optionalNumber(args.limit, "limit"),
        maxOwnedFiles: optionalNumber(args.maxOwnedFiles, "maxOwnedFiles")
      });
    case toolNames.expandNodeCode:
      return expandNodeCode(project, { id: requireString(args.id, "id"), maxBytes: optionalNumber(args.maxBytes, "maxBytes") });
    case toolNames.traceDependencies:
      return traceDependencies(project, {
        from: requireString(args.from, "from"),
        to: requireString(args.to, "to"),
        maxDepth: optionalNumber(args.maxDepth, "maxDepth")
      });
    case toolNames.findDuplicateCapability:
      return findDuplicateCapability(project, {
        query: requireString(args.query, "query"),
        limit: optionalNumber(args.limit, "limit"),
        maxOwnedFiles: optionalNumber(args.maxOwnedFiles, "maxOwnedFiles")
      });
    case toolNames.getRepoContext:
      return getRepoContext(project);
    case toolNames.listEvidenceFiles:
      return listEvidenceFiles(project);
    case toolNames.getEvidence:
      return getEvidence(project, { name: requireString(args.name, "name"), maxBytes: optionalNumber(args.maxBytes, "maxBytes") });
    case toolNames.listNodes:
      return listNodes(project, { limit: optionalNumber(args.limit, "limit") });
    case toolNames.getNodeSchema:
      return getNodeSchema();
    case toolNames.writeNode:
      return writeNode(project, { node: args.node, mode: optionalString(args.mode, "mode") });
    case toolNames.writeSummary:
      return writeSummary(project, { nodeId: requireString(args.nodeId, "nodeId"), summary: requireString(args.summary, "summary") });
    case toolNames.deleteNode:
      return deleteNode(project, { id: requireString(args.id, "id"), deleteSummary: optionalBoolean(args.deleteSummary, "deleteSummary") });
    case toolNames.rebuildGraph:
      return rebuildGraph(project);
    case toolNames.validate:
      return validate(project);
    case toolNames.getGenerationInstructions:
      return getGenerationInstructions();
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

function optionalString(value: unknown, name: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new Error(`Expected string argument: ${name}`);
  }

  return value;
}

function optionalBoolean(value: unknown, name: string): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "boolean") {
    throw new Error(`Expected boolean argument: ${name}`);
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
