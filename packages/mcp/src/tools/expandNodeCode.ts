import { existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import type { LoadedFabricProject } from "../utils/loadFabricProject";
import { clampMaxBytes, limitUtf8 } from "../utils/limitOutput";

export interface ExpandNodeCodeInput {
  id: string;
  maxBytes?: number;
}

export interface ExpandedFile {
  path: string;
  content?: string;
  truncated?: boolean;
  skipped?: boolean;
  reason?: string;
}

const defaultMaxBytes = 20_000;
const hardCapBytes = 100_000;

export async function expandNodeCode(project: LoadedFabricProject, input: ExpandNodeCodeInput): Promise<{
  id: string;
  files: ExpandedFile[];
  truncated: boolean;
  maxBytes: number;
}> {
  const node = project.graph.nodes.find((candidate) => candidate.id === input.id);
  if (!node) {
    throw new Error(`Fabric node not found: ${input.id}`);
  }

  const maxBytes = clampMaxBytes(input.maxBytes, defaultMaxBytes, hardCapBytes);
  let remainingBytes = maxBytes;
  let truncated = false;
  const files: ExpandedFile[] = [];

  for (const ownedPath of node.owns) {
    const guard = safeProjectFile(project.projectRoot, ownedPath);
    if (!guard.ok) {
      files.push({ path: ownedPath, skipped: true, reason: guard.reason });
      continue;
    }

    if (!existsSync(guard.absolutePath)) {
      files.push({ path: ownedPath, skipped: true, reason: "File does not exist." });
      continue;
    }

    const fileStat = await stat(guard.absolutePath);
    if (!fileStat.isFile()) {
      files.push({ path: ownedPath, skipped: true, reason: "Path is not a file." });
      continue;
    }

    const content = await readFile(guard.absolutePath, "utf8");
    if (isLikelyBinary(content)) {
      files.push({ path: ownedPath, skipped: true, reason: "Skipped binary file." });
      continue;
    }

    if (remainingBytes <= 0) {
      truncated = true;
      files.push({ path: ownedPath, content: "", truncated: true });
      continue;
    }

    const limited = limitUtf8(content, remainingBytes);
    remainingBytes -= limited.bytes;
    truncated = truncated || limited.truncated;
    files.push({ path: ownedPath, content: limited.content, truncated: limited.truncated });
  }

  return { id: input.id, files, truncated, maxBytes };
}

export function safeProjectFile(projectRoot: string, filePath: string): { ok: true; absolutePath: string } | { ok: false; reason: string } {
  if (isSecretPath(filePath)) {
    return { ok: false, reason: "Skipped sensitive file path." };
  }

  const root = resolve(projectRoot);
  const absolutePath = resolve(root, filePath);
  const relativePath = relative(root, absolutePath);

  if (relativePath.startsWith("..") || relativePath === "" || relativePath.includes(`..${sep}`) || absolutePath === root) {
    return { ok: false, reason: "Skipped path outside project root." };
  }

  if (relativePath.split(sep).includes(".git")) {
    return { ok: false, reason: "Skipped .git content." };
  }

  return { ok: true, absolutePath };
}

function isSecretPath(filePath: string): boolean {
  const name = filePath.split(/[\\/]/).at(-1) ?? filePath;
  return (
    name === ".env" ||
    name.startsWith(".env.") ||
    name === "id_rsa" ||
    name === "id_ed25519" ||
    /\.(pem|key|crt|p12|pfx)$/i.test(name)
  );
}

function isLikelyBinary(content: string): boolean {
  return content.slice(0, 512).includes("\0");
}
