import { mkdir, readdir, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { FabricNode } from "../graph/types";
import { generateStaticSummary } from "../summaries/generateStaticSummaries";

export async function writeNodes(projectRoot: string, nodes: FabricNode[]): Promise<void> {
  const nodesDirectory = join(projectRoot, ".fab", "nodes");
  const summariesDirectory = join(projectRoot, ".fab", "summaries");
  await mkdir(nodesDirectory, { recursive: true });
  await mkdir(summariesDirectory, { recursive: true });
  await clearGeneratedFiles(nodesDirectory, ".node.json");
  await clearGeneratedFiles(summariesDirectory, ".summary.md");

  for (const node of [...nodes].sort((a, b) => a.id.localeCompare(b.id))) {
    await writeFile(join(nodesDirectory, `${node.id}.node.json`), `${JSON.stringify(node, null, 2)}\n`);
    await writeFile(join(summariesDirectory, `${node.id}.summary.md`), generateStaticSummary(node));
  }
}

async function clearGeneratedFiles(directory: string, suffix: string): Promise<void> {
  for (const file of await readdir(directory)) {
    if (file.endsWith(suffix)) {
      await unlink(join(directory, file));
    }
  }
}
