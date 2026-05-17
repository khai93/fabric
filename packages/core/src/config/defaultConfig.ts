export interface FabricConfig {
  version: string;
  sourceOfTruth: "files";
  nodeGranularity: "capability";
  include: string[];
  exclude: string[];
}

export const defaultConfig: FabricConfig = {
  version: "0.1.0",
  sourceOfTruth: "files",
  nodeGranularity: "capability",
  include: ["src/**/*", "app/**/*", "packages/**/*"],
  exclude: ["node_modules/**", ".git/**", ".fab/**", "dist/**", "build/**", "coverage/**"]
};
