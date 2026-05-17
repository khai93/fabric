import type { FabricNode } from "@khai93/fabric-core";

export interface NodeScore {
  score: number;
  matchedTokens: string[];
}

export interface SearchableNode {
  node: FabricNode;
  summary?: string;
}

export function tokenize(query: string): string[] {
  return [...new Set(query.toLowerCase().match(/[a-z0-9._/-]+/g) ?? [])].sort();
}

export function scoreNode(query: string, searchable: SearchableNode): NodeScore {
  const tokens = tokenize(query);
  const exactQuery = query.trim().toLowerCase();
  const node = searchable.node;
  let score = 0;
  const matchedTokens = new Set<string>();

  if (exactQuery.length > 0 && node.id.toLowerCase() === exactQuery) {
    score += 100;
  }

  if (exactQuery.length > 0 && node.name.toLowerCase() === exactQuery) {
    score += 90;
  }

  for (const token of tokens) {
    const tokenScore =
      scoreField(token, node.id, 12) +
      scoreField(token, node.name, 10) +
      scoreField(token, node.type, 6) +
      scoreFields(token, node.tags ?? [], 6) +
      scoreFields(token, node.owns, 5) +
      scoreField(token, node.description ?? "", 2) +
      scoreField(token, searchable.summary ?? "", 1);

    if (tokenScore > 0) {
      matchedTokens.add(token);
      score += tokenScore;
    }
  }

  return { score, matchedTokens: [...matchedTokens].sort() };
}

function scoreFields(token: string, fields: string[], weight: number): number {
  return fields.reduce((total, field) => total + scoreField(token, field, weight), 0);
}

function scoreField(token: string, field: string, weight: number): number {
  const normalized = field.toLowerCase();
  if (normalized === token) {
    return weight * 2;
  }
  return normalized.includes(token) ? weight : 0;
}
