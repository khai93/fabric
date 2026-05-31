import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { FabricNode } from "@khai93/fabric-core";
import type { LoadedFabricProject } from "../utils/loadFabricProject";
import { clampMaxBytes, limitUtf8 } from "../utils/limitOutput";

export interface GetNodeInput {
  id: string;
  maxSummaryBytes?: number;
  maxOwnedFiles?: number;
  maxDependsOn?: number;
}

export async function getNode(project: LoadedFabricProject, input: GetNodeInput): Promise<{
  node: CompactFabricNode;
  summary: string;
  summaryTruncated: boolean;
  maxSummaryBytes: number;
}> {
  const node = project.graph.nodes.find((candidate) => candidate.id === input.id);
  if (!node) {
    throw new Error(`Fabric node not found: ${input.id}`);
  }

  const maxSummaryBytes = clampMaxBytes(input.maxSummaryBytes, 4_000, 50_000);
  const summary = limitUtf8(await readSummary(project, node), maxSummaryBytes);

  return {
    node: compactNode(node, {
      maxOwnedFiles: normalizeCount(input.maxOwnedFiles, 20, 100),
      maxDependsOn: normalizeCount(input.maxDependsOn, 20, 100)
    }),
    summary: summary.content,
    summaryTruncated: summary.truncated,
    maxSummaryBytes
  };
}

export type CompactFabricNode = Omit<FabricNode, "owns" | "dependsOn"> & {
  owns: string[];
  dependsOn: string[];
  totalOwnedFiles: number;
  totalDependencies: number;
  ownsTruncated?: boolean;
  dependsOnTruncated?: boolean;
};

function compactNode(node: FabricNode, options: { maxOwnedFiles: number; maxDependsOn: number }): CompactFabricNode {
  const owns = node.owns.slice(0, options.maxOwnedFiles);
  const dependsOn = node.dependsOn.slice(0, options.maxDependsOn);

  return {
    ...node,
    owns,
    dependsOn,
    totalOwnedFiles: node.owns.length,
    totalDependencies: node.dependsOn.length,
    ownsTruncated: owns.length < node.owns.length ? true : undefined,
    dependsOnTruncated: dependsOn.length < node.dependsOn.length ? true : undefined
  };
}

function normalizeCount(value: unknown, defaultValue: number, cap: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return defaultValue;
  }

  return Math.min(Math.floor(value), cap);
}

async function readSummary(project: LoadedFabricProject, node: FabricNode): Promise<string> {
  if (!node.summaryPath) {
    return "";
  }

  const summaryPath = join(project.projectRoot, node.summaryPath);
  if (!existsSync(summaryPath)) {
    return "";
  }

  try {
    return await readFile(summaryPath, "utf8");
  } catch {
    return "";
  }
}
