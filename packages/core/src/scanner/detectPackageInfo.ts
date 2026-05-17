import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export interface PackageInfo {
  name: string;
  dependencies: string[];
  devDependencies: string[];
}

export async function detectPackageInfo(projectRoot: string): Promise<PackageInfo> {
  const packagePath = join(projectRoot, "package.json");
  if (!existsSync(packagePath)) {
    return { name: "unknown-project", dependencies: [], devDependencies: [] };
  }

  const packageJson = JSON.parse(await readFile(packagePath, "utf8")) as {
    name?: string;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };

  return {
    name: packageJson.name ?? "unknown-project",
    dependencies: Object.keys(packageJson.dependencies ?? {}).sort(),
    devDependencies: Object.keys(packageJson.devDependencies ?? {}).sort()
  };
}
