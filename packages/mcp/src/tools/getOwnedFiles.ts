import { existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import { join } from "node:path";
import type { LoadedFabricProject } from "../utils/loadFabricProject";

export interface GetOwnedFilesInput {
  id: string;
}

export async function getOwnedFiles(project: LoadedFabricProject, input: GetOwnedFilesInput): Promise<{
  id: string;
  files: Array<{ path: string; exists: boolean; sizeBytes?: number }>;
}> {
  const node = project.graph.nodes.find((candidate) => candidate.id === input.id);
  if (!node) {
    throw new Error(`Fabric node not found: ${input.id}`);
  }

  return {
    id: input.id,
    files: await Promise.all(node.owns.map(async (path) => {
      const absolutePath = join(project.projectRoot, path);
      if (!existsSync(absolutePath)) {
        return { path, exists: false };
      }

      return { path, exists: true, sizeBytes: (await stat(absolutePath)).size };
    }))
  };
}
