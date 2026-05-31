# Fabric

Fabric is a local architecture index for large TypeScript and JavaScript repositories.
It scans a project, writes a deterministic `.fab/` overlay, and exposes that overlay to AI coding agents through MCP so they can search architecture nodes before loading raw source files.

Source files remain the source of truth. Fabric does not move code, run code from the graph, call hosted AI APIs, create embeddings, or send repository content to a cloud service.

## Why Fabric

AI agents are good at editing code once they have the right context. They are much worse when every task starts with broad repository search, repeated file reads, and an oversized prompt.

Fabric gives agents a small, stable map of the codebase:

- semantic nodes for capabilities, utilities, apps, tests, routes, and services
- ownership links from nodes to source files
- dependency edges inferred from imports
- static summaries and evidence files for repeatable context
- MCP tools for search, expansion, authoring, graph rebuilds, and validation

Use Fabric alongside normal code search. It is not a replacement for `rg`, the TypeScript compiler, tests, or code review.

## Install

```sh
bun add --global @khai93/fabric-cli
```

The package installs both commands:

```sh
fab --help
fabric --help
```

You can also run Fabric from this repository during development:

```sh
bun run dev -- --help
```

## Quick Start

Run Fabric at the root of a TypeScript or JavaScript project:

```sh
fab init
fab scan
fab validate
fab status
```

Fabric writes a `.fab/` overlay:

```txt
.fab/
  FAB.md
  config.json
  graph.json
  ownership-map.json
  dependency-map.json
  evidence/
  nodes/
  summaries/
```

Commit the overlay if you want agents and teammates to share the same architecture index. Regenerate it after meaningful source changes:

```sh
fab scan
fab validate
```

## MCP Usage

Start the MCP server from the indexed project:

```sh
fab mcp
```

Example MCP client configuration:

```json
{
  "mcpServers": {
    "fabric": {
      "command": "fab",
      "args": ["mcp"],
      "cwd": "/absolute/path/to/project"
    }
  }
}
```

Useful tools exposed by the server:

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

MCP stdout is reserved for the stdio protocol. Human-readable logs and diagnostics go to stderr.

## Benchmarks

These benchmarks were run on May 31, 2026 against a shallow clone of Nx:

```txt
Repository: https://github.com/nrwl/nx
Commit:     4125769
Checkout:   197 MB
Files:      9,699 total, excluding .git and node_modules
Sources:    4,812 TypeScript/JavaScript files before Fabric output
Command:    bun run /home/khai/projects/fabric/packages/cli/src/index.ts scan
```

### Overlay generation

Fabric scanned Nx and generated:

```txt
Source files scanned: 4,800
Nodes generated:      3,075
Dependency edges:     6,080
.fab files:           6,163
.fab size:            37 MB
Validation:           passed, 0 warnings
```

Five repeated scan runs on the same checkout:

| Run | Wall time | Max RSS |
| --- | ---: | ---: |
| 1 | 2.92 s | 199,540 KB |
| 2 | 4.37 s | 205,864 KB |
| 3 | 2.66 s | 212,068 KB |
| 4 | 2.76 s | 212,240 KB |
| 5 | 2.53 s | 225,180 KB |

Median scan time: **2.76 seconds**.

### Agent context benchmark

Task prompt:

```txt
In the Nx repository, identify the source files an agent should inspect to change how project.json/workspace.json project configuration feeds project graph creation.
```

The task was run both ways: first as a regular raw-repository prompt using search and file reads, then with Fabric node search and node expansion.

| Workflow | Retrieval work | Wall time | Context payload |
| --- | --- | ---: | ---: |
| Regular prompt | two `rg` searches plus targeted file reads | ~0.03 s median | 275,146 bytes |
| Fabric-assisted prompt | `search_nodes`, three `get_node` calls, one `expand_node_code` call | 30.37 ms median | 29,499 bytes |

Both workflows identified the same core edit targets:

- `packages/nx/src/config/workspace-json-project-json.ts`
- `packages/nx/src/project-graph/utils/project-configuration-utils.ts`
- `packages/nx/src/project-graph/project-graph.ts`
- `packages/workspace/src/core/project-graph.ts`

Result: Fabric did not beat `rg` at raw local text search. Fabric is useful at the agent-context layer: it reduced the prompt payload for this discovery task by **89.3%** while preserving the same target files, leaving less repeated search output, less irrelevant context, and fewer tokens to reason over.

## Commands

### `fab init`

Creates the initial `.fab/` directory and config files. No network access or AI key is required.

### `fab scan`

Runs deterministic static analysis for TypeScript and JavaScript projects. The scanner detects package metadata, source files, imports, exports, test files, Express-style routes, and conventional folders such as services, routes, controllers, models, middleware, repositories, utilities, components, and systems.

### `fab status`

Prints project name, `.fab/` availability, scanned source file count, generated node count, dependency edge count, summary count, and graph warnings.

### `fab validate`

Validates the overlay. It catches missing owned files, unknown dependency node IDs, missing summaries, and missing evidence.

### `fab mcp`

Starts the MCP server over stdio for AI coding clients.

### `fab generate --prompt`

Writes `.fab/prompts/generate-nodes.md` as a fallback prompt. Prefer MCP-assisted generation when your client supports Fabric tools.

## MCP-Assisted Node Generation

Fabric v0.3 focuses on MCP-assisted AI node generation. After scanning a project, ask your AI coding client:

```txt
Use the Fabric MCP server to generate semantic architecture nodes for this repository. Read the evidence, create capability-level nodes, write summaries, rebuild the graph, and validate the result.
```

The agent should use Fabric MCP write tools instead of manually editing `.fab` files:

- `fabric.get_repo_context`
- `fabric.get_evidence`
- `fabric.get_node_schema`
- `fabric.write_node`
- `fabric.write_summary`
- `fabric.rebuild_graph`
- `fabric.validate`
- `fabric.get_generation_instructions`

Run validation after generation:

```sh
fab validate
```

## Development

Fabric is a Bun and TypeScript monorepo.

```sh
bun install
bun run check
bun test
```

Local CLI commands:

```sh
bun run dev -- init
bun run dev -- scan
bun run dev -- status
bun run dev -- validate
bun run dev -- mcp
bun run dev -- generate --prompt
```

Packages:

- `@khai93/fabric-core`
- `@khai93/fabric-mcp`
- `@khai93/fabric-cli`

## Non-Goals

Fabric is not a visual programming language, app generator, replacement IDE, graph runtime, cloud indexing service, embeddings system, telemetry pipeline, or automatic code-editing engine.
