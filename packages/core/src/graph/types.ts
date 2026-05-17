export type FabricNodeType =
  | "app"
  | "service"
  | "route"
  | "controller"
  | "middleware"
  | "repository"
  | "model"
  | "component"
  | "utility"
  | "test"
  | "workflow"
  | "unknown";

export interface FabricEvidence {
  file: string;
  startLine?: number;
  endLine?: number;
  reason: string;
}

export interface FabricNode {
  id: string;
  name: string;
  type: FabricNodeType;
  description?: string;
  owns: string[];
  dependsOn: string[];
  inputs?: Record<string, string>;
  outputs?: Record<string, string>;
  tags?: string[];
  summaryPath?: string;
  evidence?: FabricEvidence[];
}

export interface FabricEdge {
  from: string;
  to: string;
  type:
    | "imports"
    | "calls"
    | "owns"
    | "depends_on"
    | "route_to_service"
    | "test_covers";
  evidence?: FabricEvidence[];
}

export interface FabricGraph {
  version: string;
  generatedAt: string;
  projectRoot: string;
  projectName: string;
  filesScanned: number;
  nodes: FabricNode[];
  edges: FabricEdge[];
  warnings?: string[];
}
