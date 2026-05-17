import type { LoadedFabricProject } from "../utils/loadFabricProject";
import { scoreNode } from "../utils/scoreText";
import { normalizeLimit, readNodeSummaries } from "./searchNodes";

export interface FindDuplicateCapabilityInput {
  query: string;
  limit?: number;
}

export async function findDuplicateCapability(project: LoadedFabricProject, input: FindDuplicateCapabilityInput): Promise<{
  query: string;
  candidates: Array<{
    id: string;
    name: string;
    type: string;
    score: number;
    reason: string;
    owns: string[];
  }>;
  instruction: string;
}> {
  const summaries = await readNodeSummaries(project);
  const candidates = project.graph.nodes
    .map((node) => {
      const scored = scoreNode(input.query, { node, summary: summaries.get(node.id) });
      return { node, ...scored };
    })
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score || a.node.id.localeCompare(b.node.id))
    .slice(0, normalizeLimit(input.limit, 5))
    .map(({ node, score, matchedTokens }) => ({
      id: node.id,
      name: node.name,
      type: node.type,
      score,
      reason: matchedTokens.length > 0
        ? `Matched ${matchedTokens.join(", ")} in node metadata, summaries, or owned files.`
        : "Matched node metadata, summaries, or owned files.",
      owns: node.owns
    }));

  return {
    query: input.query,
    candidates,
    instruction: "Review these candidates before creating a new node or new source files."
  };
}
