import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
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
  "change",
  "changes",
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
  "name",
  "names",
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
  const symbolsByFile = await readSymbolsByFile(project);
  const taskTokens = relevantTokens(input.task);
  const normalizedTask = input.task.toLowerCase();
  const scored = project.graph.nodes
    .map((node) => {
      const score = scorePlannedNode(node, summaries.get(node.id), taskTokens, normalizedTask, symbolsByFile);
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
  const testNodes = secondaryNodes
    .filter((node) => node.type === "test")
    .sort((a, b) => relatedTestRank(a, primaryNodes) - relatedTestRank(b, primaryNodes) || b.score - a.score || a.id.localeCompare(b.id))
    .slice(0, mode === "edit" ? 2 : 1);

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

function relatedTestRank(testNode: PlannedNode, primaryNodes: PlannedNode[]): number {
  const testSuffix = testNode.id.replace(/^test\./, "");
  const primaryIndex = primaryNodes.findIndex((node) => node.id.endsWith(testSuffix));

  return primaryIndex === -1 ? Number.MAX_SAFE_INTEGER : primaryIndex;
}

function relevantTokens(task: string): string[] {
  const expanded = new Set<string>();

  for (const rawToken of task.match(/[A-Za-z0-9._/-]+/g) ?? []) {
    const token = rawToken.toLowerCase();
    expanded.add(token);

    for (const part of rawToken.split(/[._/-]+/)) {
      if (part.length > 0) {
        expanded.add(part.toLowerCase());
      }
    }

    for (const part of rawToken.replace(/([a-z0-9])([A-Z])/g, "$1 $2").split(/\s+/)) {
      if (part.length > 0) {
        expanded.add(part.toLowerCase());
      }
    }
  }

  for (const token of tokenize(task)) {
    expanded.add(token);
  }

  return [...expanded]
    .map((token) => token.replace(/^--/, ""))
    .flatMap((token) => token.endsWith("s") && token.length > 4 ? [token, token.slice(0, -1)] : [token])
    .filter((token) => token.length > 1 && !stopWords.has(token));
}

function scorePlannedNode(
  node: FabricNode,
  summary: string | undefined,
  tokens: string[],
  normalizedTask: string,
  symbolsByFile: Map<string, string[]>
): { score: number; matchedTokens: string[] } {
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

  for (const ownedPath of node.owns) {
    for (const symbol of symbolsByFile.get(ownedPath) ?? []) {
      const normalizedSymbol = symbol.toLowerCase();
      if (normalizedSymbol.length >= 12 && normalizedTask.includes(normalizedSymbol)) {
        matchedTokens.add(symbol);
        score += 300;
      }
    }
  }

  score += bestOwnedPathCoverage(node.owns, tokens) * 18;

  if (node.type === "test" && tokens.some((token) => token.includes("test") || token.includes("spec"))) {
    score += 10;
  }

  if (node.owns.length > 20) {
    score -= 40;
  } else if (node.owns.length > 5) {
    score -= 15;
  }

  return { score, matchedTokens: [...matchedTokens].sort() };
}

async function readSymbolsByFile(project: LoadedFabricProject): Promise<Map<string, string[]>> {
  const symbolsPath = join(project.fabDir, "evidence", "symbols.json");
  const symbolsByFile = new Map<string, string[]>();

  if (!existsSync(symbolsPath)) {
    return symbolsByFile;
  }

  try {
    const symbols = JSON.parse(await readFile(symbolsPath, "utf8")) as Array<{ file?: unknown; symbol?: unknown }>;
    for (const entry of symbols) {
      if (typeof entry.file !== "string" || typeof entry.symbol !== "string") {
        continue;
      }

      const existing = symbolsByFile.get(entry.file) ?? [];
      existing.push(entry.symbol);
      symbolsByFile.set(entry.file, existing);
    }
  } catch {
    return new Map();
  }

  return symbolsByFile;
}

function maxFieldScore(token: string, fields: string[], weight: number): number {
  return fields.reduce((best, field) => Math.max(best, scoreField(token, field, weight)), 0);
}

function scoreField(token: string, field: string, weight: number): number {
  const normalized = field.toLowerCase();
  if (normalized === token) {
    return weight * 2;
  }
  if (tokenMatches(normalized, token)) {
    return weight;
  }

  return 0;
}

function tokenMatches(normalizedField: string, token: string): boolean {
  if (normalizedField.includes(token)) {
    return true;
  }

  const stem = token.endsWith("e") ? token.slice(0, -1) : "";
  return stem.length > 2 && normalizedField.includes(stem);
}

function bestOwnedPathCoverage(owns: string[], tokens: string[]): number {
  let best = 0;

  for (const ownedPath of owns) {
    const normalized = ownedPath.toLowerCase();
    const coverage = tokens.filter((token) => tokenMatches(normalized, token)).length;
    best = Math.max(best, coverage);
  }

  return best;
}
