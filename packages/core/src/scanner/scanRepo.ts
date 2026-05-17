import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative, sep } from "node:path";
import { loadConfig } from "../config/loadConfig";
import { detectExports, detectImports, type DetectedExport, type DetectedImport } from "./detectImports";
import { detectPackageInfo, type PackageInfo } from "./detectPackageInfo";
import { detectRoutes, type DetectedRoute } from "./detectRoutes";
import { isTestFile } from "./detectTests";

export interface SourceFileInfo {
  path: string;
  absolutePath: string;
  imports: DetectedImport[];
  exports: DetectedExport[];
  routes: DetectedRoute[];
  isTest: boolean;
}

export interface ScanResult {
  projectRoot: string;
  packageInfo: PackageInfo;
  files: SourceFileInfo[];
  warnings: string[];
}

const sourceExtensions = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);
const excludedDirectories = new Set(["node_modules", ".git", ".fab", "dist", "build", "coverage"]);

export async function scanRepo(projectRoot: string): Promise<ScanResult> {
  await loadConfig(projectRoot);
  const packageInfo = await detectPackageInfo(projectRoot);
  const files = await collectSourceFiles(projectRoot, projectRoot);
  const sourceFiles: SourceFileInfo[] = [];
  const warnings: string[] = [];

  for (const absolutePath of files.sort()) {
    const source = await readFile(absolutePath, "utf8");
    const relativePath = normalizePath(relative(projectRoot, absolutePath));
    sourceFiles.push({
      path: relativePath,
      absolutePath,
      imports: detectImports(source),
      exports: detectExports(source),
      routes: detectRoutes(source),
      isTest: isTestFile(relativePath)
    });
  }

  if (sourceFiles.length === 0) {
    warnings.push("No TypeScript or JavaScript source files were found.");
  }

  return {
    projectRoot,
    packageInfo,
    files: sourceFiles.sort((a, b) => a.path.localeCompare(b.path)),
    warnings
  };
}

async function collectSourceFiles(projectRoot: string, currentDirectory: string): Promise<string[]> {
  const entries = await readdir(currentDirectory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const absolutePath = join(currentDirectory, entry.name);
    if (entry.isDirectory()) {
      if (!excludedDirectories.has(entry.name)) {
        files.push(...await collectSourceFiles(projectRoot, absolutePath));
      }
      continue;
    }

    if (entry.isFile() && sourceExtensions.has(extname(entry.name))) {
      files.push(absolutePath);
    }
  }

  return files;
}

function normalizePath(path: string): string {
  return path.split(sep).join("/");
}
