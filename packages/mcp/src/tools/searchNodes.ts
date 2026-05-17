import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { FabricNode } from "@khai93/fabric-core";
import type { LoadedFabricProject } from "../utils/loadFabricProject";
import { scoreNode } from "../utils/scoreText";

export interface SearchNodesInput {
  query: string;
  limit?: number;
}

export interface SearchNodesMatch {
  id: string;
  name: string;
  type: string;
  score: number;
  description?: string;
  owns: string[];
  summaryPath?: string;
}

export async function searchNodes(project: LoadedFabricProject, input: SearchNodesInput): Promise<{
  query: string;
  matches: SearchNodesMatch[];
}> {
  const limit = normalizeLimit(input.limit, 10);
  const summaries = await readNodeSummaries(project);
  const matches = project.graph.nodes
    .map((node) => ({
      node,
      score: scoreNode(input.query, { node, summary: summaries.get(node.id) }).score
    }))
    .filter((match) => match.score > 0)
    .sort((a, b) => b.score - a.score || a.node.id.localeCompare(b.node.id))
    .slice(0, limit)
    .map(({ node, score }) => toSearchMatch(node, score));

  return { query: input.query, matches };
}

export function normalizeLimit(value: unknown, defaultLimit: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return defaultLimit;
  }

  return Math.min(Math.floor(value), 50);
}

export async function readNodeSummaries(project: LoadedFabricProject): Promise<Map<string, string>> {
  const summaries = new Map<string, string>();

  await Promise.all(project.graph.nodes.map(async (node) => {
    if (!node.summaryPath) {
      return;
    }

    const summaryPath = join(project.projectRoot, node.summaryPath);
    if (!existsSync(summaryPath)) {
      return;
    }

    try {
      summaries.set(node.id, await readFile(summaryPath, "utf8"));
    } catch {
      // Summaries are optional context; ignore unreadable files.
    }
  }));

  return summaries;
}

function toSearchMatch(node: FabricNode, score: number): SearchNodesMatch {
  return {
    id: node.id,
    name: node.name,
    type: node.type,
    score,
    description: node.description,
    owns: node.owns,
    summaryPath: node.summaryPath
  };
}
