import type { FabricGraph, FabricNode } from "@fabric/core";
import type { LoadedFabricProject } from "../utils/loadFabricProject";

export interface TraceDependenciesInput {
  from: string;
  to: string;
  maxDepth?: number;
}

export function traceDependencies(project: LoadedFabricProject, input: TraceDependenciesInput): {
  from: string;
  to: string;
  pathFound: boolean;
  path: Array<Pick<FabricNode, "id" | "name" | "type">>;
} {
  const maxDepth = normalizeMaxDepth(input.maxDepth);
  const nodeById = new Map(project.graph.nodes.map((node) => [node.id, node]));

  if (!nodeById.has(input.from)) {
    throw new Error(`Fabric node not found: ${input.from}`);
  }

  if (!nodeById.has(input.to)) {
    throw new Error(`Fabric node not found: ${input.to}`);
  }

  const path = bfs(project.graph, input.from, input.to, maxDepth);

  return {
    from: input.from,
    to: input.to,
    pathFound: path.length > 0,
    path: path.map((id) => {
      const node = nodeById.get(id);
      if (!node) {
        throw new Error(`Fabric node not found: ${id}`);
      }
      return { id: node.id, name: node.name, type: node.type };
    })
  };
}

export function bfs(graph: FabricGraph, from: string, to: string, maxDepth: number): string[] {
  const adjacency = new Map<string, string[]>();
  for (const edge of graph.edges) {
    const edges = adjacency.get(edge.from) ?? [];
    edges.push(edge.to);
    adjacency.set(edge.from, edges);
  }

  for (const [id, edges] of adjacency) {
    adjacency.set(id, [...edges].sort());
  }

  const queue: Array<{ id: string; path: string[] }> = [{ id: from, path: [from] }];
  const seen = new Set<string>([from]);

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      break;
    }

    if (current.id === to) {
      return current.path;
    }

    if (current.path.length - 1 >= maxDepth) {
      continue;
    }

    for (const next of adjacency.get(current.id) ?? []) {
      if (seen.has(next)) {
        continue;
      }

      seen.add(next);
      queue.push({ id: next, path: [...current.path, next] });
    }
  }

  return [];
}

function normalizeMaxDepth(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return 5;
  }

  return Math.min(Math.floor(value), 10);
}
