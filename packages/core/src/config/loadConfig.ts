import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { defaultConfig, type FabricConfig } from "./defaultConfig";

export async function loadConfig(projectRoot: string): Promise<FabricConfig> {
  const configPath = join(projectRoot, ".fab", "config.json");
  if (!existsSync(configPath)) {
    return defaultConfig;
  }

  const parsed = JSON.parse(await readFile(configPath, "utf8")) as Partial<FabricConfig>;
  return {
    ...defaultConfig,
    ...parsed,
    include: parsed.include ?? defaultConfig.include,
    exclude: parsed.exclude ?? defaultConfig.exclude
  };
}
