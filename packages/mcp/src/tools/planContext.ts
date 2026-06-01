import type { FabricNode } from "@khai93/fabric-core";
import type { LoadedFabricProject } from "../utils/loadFabricProject";
import { scoreNode } from "../utils/scoreText";
import { normalizeLimit, readNodeSummaries } from "./searchNodes";

export type ContextPlanMode = "plan" | "edit" | "explain" | "review";

export interface PlanContextInput {
  task: string;
  mode?: string;
  limit?: number;
  maxOwnedFiles?: number;
}

export interface PlannedNode {
  id: string;
  name: string;
  type: string;
  score: number;
  reason: string;
  owns: string[];
  ownsTruncated?: boolean;
  totalOwnedFiles: number;
}

export interface SuggestedToolCall {
  tool: string;
  args: Record<string, unknown>;
  reason: string;
}

const defaultLimit = 6;
const defaultMaxOwnedFiles = 4;

export async function planContext(project: LoadedFabricProject, input: PlanContextInput): Promise<{
  task: string;
  mode: ContextPlanMode;
  primaryNodes: PlannedNode[];
  secondaryNodes: PlannedNode[];
  suggestedToolCalls: SuggestedToolCall[];
  instruction: string;
}> {
  const mode = normalizeMode(input.mode);
  const limit = normalizeLimit(input.limit, defaultLimit, 15);
  const maxOwnedFiles = normalizeLimit(input.maxOwnedFiles, defaultMaxOwnedFiles, 20);
  const summaries = await readNodeSummaries(project);
  const scored = project.graph.nodes
    .map((node) => {
      const score = scoreNode(input.task, { node, summary: summaries.get(node.id) });
      return { node, ...score };
    })
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score || typeRank(a.node, mode) - typeRank(b.node, mode) || a.node.id.localeCompare(b.node.id));

  const primaryCount = Math.min(limit, mode === "edit" ? 4 : 5);
  const primaryCandidates = scored
    .filter((candidate) => mode !== "edit" || candidate.node.type !== "test")
    .slice(0, primaryCount);
  const primaryIds = new Set(primaryCandidates.map((candidate) => candidate.node.id));

  const secondaryCandidates = scored
    .filter((candidate) => !primaryIds.has(candidate.node.id))
    .filter((candidate) => mode !== "edit" || candidate.node.type === "test" || candidate.score >= primaryThreshold(primaryCandidates))
    .slice(0, Math.max(0, limit - primaryCandidates.length));

  const primaryNodes = primaryCandidates.map((candidate) => toPlannedNode(candidate.node, candidate.score, candidate.matchedTokens, maxOwnedFiles));
  const secondaryNodes = secondaryCandidates.map((candidate) => toPlannedNode(candidate.node, candidate.score, candidate.matchedTokens, maxOwnedFiles));

  return {
    task: input.task,
    mode,
    primaryNodes,
    secondaryNodes,
    suggestedToolCalls: suggestToolCalls(primaryNodes, secondaryNodes, mode),
    instruction: "Start with primaryNodes. Expand code for the smallest set of primary nodes needed, then use secondaryNodes only if tests, callers, or related behavior are missing."
  };
}

function toPlannedNode(node: FabricNode, score: number, matchedTokens: string[], maxOwnedFiles: number): PlannedNode {
  const owns = node.owns.slice(0, maxOwnedFiles);

  return {
    id: node.id,
    name: node.name,
    type: node.type,
    score,
    reason: matchedTokens.length > 0
      ? `Matched ${matchedTokens.slice(0, 8).join(", ")} in node metadata, summaries, or owned files.`
      : "Matched node metadata, summaries, or owned files.",
    owns,
    ownsTruncated: owns.length < node.owns.length ? true : undefined,
    totalOwnedFiles: node.owns.length
  };
}

function suggestToolCalls(primaryNodes: PlannedNode[], secondaryNodes: PlannedNode[], mode: ContextPlanMode): SuggestedToolCall[] {
  const calls: SuggestedToolCall[] = [];
  const codeNodes = [...primaryNodes, ...secondaryNodes]
    .filter((node) => mode !== "plan" || node.type !== "test")
    .slice(0, mode === "edit" ? 4 : 3);

  for (const node of codeNodes) {
    calls.push({
      tool: "fabric.expand_node_code",
      args: { id: node.id },
      reason: node.type === "test" ? "Inspect focused test coverage." : "Inspect primary implementation code."
    });
  }

  if (primaryNodes[0]) {
    calls.push({
      tool: "fabric.get_neighbors",
      args: { id: primaryNodes[0].id, depth: 1, limit: 20 },
      reason: "Use only if the primary code does not expose enough adjacent context."
    });
  }

  return calls;
}

function normalizeMode(value: unknown): ContextPlanMode {
  return value === "edit" || value === "explain" || value === "review" || value === "plan" ? value : "plan";
}

function typeRank(node: FabricNode, mode: ContextPlanMode): number {
  if (mode === "edit") {
    return node.type === "test" ? 2 : 0;
  }

  return node.type === "test" ? 1 : 0;
}

function primaryThreshold(primaryCandidates: Array<{ score: number }>): number {
  const weakestPrimary = primaryCandidates.at(-1)?.score ?? 0;
  return Math.max(1, weakestPrimary * 0.75);
}
