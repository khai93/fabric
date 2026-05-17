# Fabric

Fabric is a semantic architecture layer for codebases. It helps AI coding agents understand projects through persistent nodes, summaries, ownership maps, and dependency graphs instead of repeatedly reading raw files from scratch.

Fabric scans an existing repository and writes a `.fab/` overlay. Existing source files remain the source of truth.

## What Fabric Is Not

Fabric is not a ComfyUI fork, visual programming language, app generator, replacement IDE, or graph runtime.

## Development Setup

```sh
bun install
bunx tsc --noEmit
```

## npm Packages

Fabric publishes under the `@khai93` npm scope:

- `@khai93/fabric-core`
- `@khai93/fabric-mcp`
- `@khai93/fabric-cli`

Install the CLI globally:

```sh
npm install -g @khai93/fabric-cli
```

The installed CLI exposes both `fab` and `fabric`.

On WSL, make sure `which bun` points to a Linux Bun install, not a Windows path such as `/mnt/c/Users/.../npm/bun`. A Windows Bun binary running inside WSL can fail workspace installs with `ENOENT` symlink errors and paths like `packages\cli`.

Install Bun inside WSL if needed:

```sh
curl -fsSL https://bun.sh/install | bash
exec "$SHELL"
which bun
bun install
```

Run the local CLI directly:

```sh
bun run packages/cli/src/index.ts init
bun run packages/cli/src/index.ts scan
bun run packages/cli/src/index.ts status
bun run packages/cli/src/index.ts mcp
bun run packages/cli/src/index.ts validate
bun run packages/cli/src/index.ts generate --prompt
```

The root shortcut also works:

```sh
bun run dev -- init
bun run dev -- scan
bun run dev -- status
bun run dev -- mcp
bun run dev -- validate
bun run dev -- generate --prompt
```

## Commands

### `fabric init`

Creates the initial `.fab/` overlay:

```txt
.fab/
  FAB.md
  config.json
  graph.json
  evidence/
  nodes/
  summaries/
  ownership-map.json
  dependency-map.json
```

No AI keys or network calls are required.

### `fabric scan`

Runs deterministic static analysis for TypeScript and JavaScript projects. It scans package metadata, source files, imports, exports, detectable Express-style routes, test files, and conventional folders such as services, routes, controllers, models, middleware, repositories, utils, components, and systems.

Generated output includes:

```txt
.fab/graph.json
.fab/ownership-map.json
.fab/dependency-map.json
.fab/evidence/*.json
.fab/nodes/*.node.json
.fab/summaries/*.summary.md
```

### `fabric status`

Prints project name, `.fab/` availability, scanned source file count, generated node count, dependency edge count, summary count, and warnings for missing graph files.

### `fabric mcp`

Starts the Fabric v0.3 MCP server over stdio. The server reads the generated `.fab/` overlay from the current working directory and exposes architecture traversal and authoring tools to external AI coding agents.

Prepare a project first:

```sh
bun run packages/cli/src/index.ts init
bun run packages/cli/src/index.ts scan
bun run packages/cli/src/index.ts mcp
```

Example MCP client config shape:

```json
{
  "mcpServers": {
    "fabric": {
      "command": "bun",
      "args": [
        "run",
        "packages/cli/src/index.ts",
        "mcp"
      ],
      "cwd": "/absolute/path/to/project"
    }
  }
}
```

AI agents can call tools such as:

- `fabric.search_nodes`
- `fabric.get_node`
- `fabric.get_neighbors`
- `fabric.get_owned_files`
- `fabric.expand_node_code`
- `fabric.trace_dependencies`
- `fabric.find_duplicate_capability`
- `fabric.get_repo_context`
- `fabric.get_evidence`
- `fabric.get_node_schema`
- `fabric.write_node`
- `fabric.write_summary`
- `fabric.rebuild_graph`
- `fabric.validate`
- `fabric.get_generation_instructions`

MCP stdout is reserved for the stdio protocol. Logs and diagnostics must go to stderr.

### `fabric validate`

Validates the `.fab/` overlay. It catches missing owned files, unknown dependency node IDs, missing summaries, and missing evidence. MCP clients receive structured JSON from `fabric.validate`; the CLI prints human-readable output.

### `fabric generate --prompt`

Writes `.fab/prompts/generate-nodes.md` as a fallback prompt. Prefer MCP-assisted generation when the AI client supports Fabric MCP tools.

## v0.3 MCP-assisted node generation

Fabric lets your AI client generate semantic architecture nodes through MCP.

```bash
fab init
fab scan
fab mcp
```

Then ask your AI client:

```txt
Use the Fabric MCP server to generate semantic architecture nodes for this repository. Read the evidence, create capability-level nodes, write summaries, rebuild the graph, and validate the result.
```

The AI should use Fabric MCP tools instead of directly editing `.fab` files.

Useful MCP tools:

- `fabric.get_repo_context`
- `fabric.get_evidence`
- `fabric.get_node_schema`
- `fabric.write_node`
- `fabric.write_summary`
- `fabric.rebuild_graph`
- `fabric.validate`
- `fabric.get_generation_instructions`

Example MCP client config:

```json
{
  "mcpServers": {
    "fabric": {
      "command": "bun",
      "args": ["run", "packages/cli/src/index.ts", "mcp"],
      "cwd": "/absolute/path/to/project"
    }
  }
}
```

## Example Node Summary

```md
# Auth Service

## Purpose
Handles authentication-related behavior.

## Owned files
- src/services/auth.service.ts

## Dependencies
- repository.user

## AI notes
- Search this node before creating new auth logic.
- Expand owned files only when implementation details are needed.
- Files remain the source of truth.
```

## Roadmap

- Static scanner
- MCP server
- AI summaries
- Graph UI
- Graph-assisted edits
