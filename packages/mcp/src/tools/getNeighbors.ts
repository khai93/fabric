import type { FabricGraph, FabricNode } from "@khai93/fabric-core";
import type { LoadedFabricProject } from "../utils/loadFabricProject";

export type NeighborDirection = "incoming" | "outgoing" | "both";

export interface GetNeighborsInput {
  id: string;
  depth?: number;
  direction?: NeighborDirection;
  limit?: number;
}

export interface Neighbor {
  id: string;
  name: string;
  type: string;
  relationship: string;
  direction: "incoming" | "outgoing";
  depth: number;
}

export function getNeighbors(project: LoadedFabricProject, input: GetNeighborsInput): {
  id: string;
  depth: number;
  direction: NeighborDirection;
  neighbors: Neighbor[];
  totalFound: number;
  truncated: boolean;
  limit: number;
} {
  assertNodeExists(project.graph, input.id);
  const depth = normalizeDepth(input.depth);
  const direction = input.direction ?? "both";
  const limit = normalizeLimit(input.limit);
  const nodeById = new Map(project.graph.nodes.map((node) => [node.id, node]));
  const seen = new Set<string>([input.id]);
  const neighbors: Neighbor[] = [];
  let totalFound = 0;
  let truncated = false;
  let frontier = [input.id];

  for (let currentDepth = 1; currentDepth <= depth; currentDepth += 1) {
    const nextFrontier: string[] = [];

    for (const currentId of frontier) {
      for (const edge of project.graph.edges) {
        const connected = connectedEdge(currentId, edge, direction);
        if (!connected) {
          continue;
        }

        const node = nodeById.get(connected.id);
        if (!node) {
          continue;
        }

        if (!seen.has(connected.id)) {
          seen.add(connected.id);
          nextFrontier.push(connected.id);
          totalFound += 1;

          if (neighbors.length < limit) {
            neighbors.push(toNeighbor(node, edge.type, connected.direction, currentDepth));
          } else {
            truncated = true;
          }
        }
      }
    }

    frontier = nextFrontier.sort();
  }

  return {
    id: input.id,
    depth,
    direction,
    neighbors: neighbors.sort((a, b) => a.depth - b.depth || a.id.localeCompare(b.id)),
    totalFound,
    truncated,
    limit
  };
}

function connectedEdge(
  id: string,
  edge: FabricGraph["edges"][number],
  direction: NeighborDirection
): { id: string; direction: "incoming" | "outgoing" } | undefined {
  if ((direction === "outgoing" || direction === "both") && edge.from === id) {
    return { id: edge.to, direction: "outgoing" };
  }

  if ((direction === "incoming" || direction === "both") && edge.to === id) {
    return { id: edge.from, direction: "incoming" };
  }

  return undefined;
}

function toNeighbor(node: FabricNode, relationship: string, direction: "incoming" | "outgoing", depth: number): Neighbor {
  return {
    id: node.id,
    name: node.name,
    type: node.type,
    relationship,
    direction,
    depth
  };
}

function normalizeDepth(value: unknown): 1 | 2 {
  return value === 2 ? 2 : 1;
}

function normalizeLimit(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return 50;
  }

  return Math.min(Math.floor(value), 200);
}

function assertNodeExists(graph: FabricGraph, id: string): void {
  if (!graph.nodes.some((node) => node.id === id)) {
    throw new Error(`Fabric node not found: ${id}`);
  }
}
