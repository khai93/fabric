import type { FabricNode } from "@khai93/fabric-core";
import type { LoadedFabricProject } from "../utils/loadFabricProject";
import { tokenize } from "../utils/scoreText";
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
const stopWords = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "code",
  "do",
  "for",
  "from",
  "how",
  "in",
  "into",
  "is",
  "it",
  "make",
  "of",
  "on",
  "or",
  "plan",
  "return",
  "smallest",
  "so",
  "that",
  "the",
  "to",
  "with"
]);

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
  const taskTokens = relevantTokens(input.task);
  const scored = project.graph.nodes
    .map((node) => {
      const score = scorePlannedNode(node, summaries.get(node.id), taskTokens);
      return { node, ...score };
    })
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score || typeRank(a.node, mode) - typeRank(b.node, mode) || a.node.id.localeCompare(b.node.id));

  const primaryCount = Math.min(limit, mode === "edit" ? 3 : 4);
  const primaryCandidates = scored
    .filter((candidate) => candidate.node.type !== "test")
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
  const codeNodes = primaryNodes.slice(0, mode === "review" ? 2 : 1);
  const testNodes = secondaryNodes.filter((node) => node.type === "test").slice(0, mode === "edit" ? 2 : 1);

  for (const node of [...codeNodes, ...testNodes]) {
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

function relevantTokens(task: string): string[] {
  return tokenize(task)
    .map((token) => token.replace(/^--/, ""))
    .filter((token) => token.length > 1 && !stopWords.has(token));
}

function scorePlannedNode(node: FabricNode, summary: string | undefined, tokens: string[]): { score: number; matchedTokens: string[] } {
  let score = 0;
  const matchedTokens = new Set<string>();

  for (const token of tokens) {
    const tokenScore = Math.max(
      scoreField(token, node.id, 16),
      scoreField(token, node.name, 14),
      scoreField(token, node.type, 4),
      scoreField(token, node.description ?? "", 5),
      scoreField(token, summary ?? "", 2),
      maxFieldScore(token, node.tags ?? [], 5),
      maxFieldScore(token, node.owns, 12)
    );

    if (tokenScore > 0) {
      matchedTokens.add(token);
      score += tokenScore;
    }
  }

  score += bestOwnedPathCoverage(node.owns, tokens) * 18;

  if (node.type === "test" && tokens.some((token) => token.includes("test") || token.includes("spec"))) {
    score += 10;
  }

  return { score, matchedTokens: [...matchedTokens].sort() };
}

function maxFieldScore(token: string, fields: string[], weight: number): number {
  return fields.reduce((best, field) => Math.max(best, scoreField(token, field, weight)), 0);
}

function scoreField(token: string, field: string, weight: number): number {
  const normalized = field.toLowerCase();
  if (normalized === token) {
    return weight * 2;
  }
  return normalized.includes(token) ? weight : 0;
}

function bestOwnedPathCoverage(owns: string[], tokens: string[]): number {
  let best = 0;

  for (const ownedPath of owns) {
    const normalized = ownedPath.toLowerCase();
    const coverage = tokens.filter((token) => normalized.includes(token)).length;
    best = Math.max(best, coverage);
  }

  return best;
}
