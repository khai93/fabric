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
```

The root shortcut also works:

```sh
bun run dev -- init
bun run dev -- scan
bun run dev -- status
bun run dev -- mcp
```

## Commands

### `fabric init`

Creates the initial `.fab/` overlay:

```txt
.fab/
  FAB.md
  config.json
  graph.json
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
.fab/nodes/*.node.json
.fab/summaries/*.summary.md
```

### `fabric status`

Prints project name, `.fab/` availability, scanned source file count, generated node count, dependency edge count, summary count, and warnings for missing graph files.

### `fabric mcp`

Starts the Fabric v0.2 MCP server over stdio. The server reads the generated `.fab/` overlay from the current working directory and exposes architecture traversal tools to external AI coding agents.

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

MCP stdout is reserved for the stdio protocol. Logs and diagnostics must go to stderr.

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
