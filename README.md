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

Agents should do the same after source edits. `fabric.rebuild_graph` updates graph relationships from existing Fabric node files; it does not rescan source files or refresh evidence.

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

### Codex task benchmarks

The following benchmarks compare regular prompting against Fabric MCP discovery on the same Nx checkout. Regular prompting used repository search and targeted file reads. Fabric MCP discovery did not receive preselected node IDs; Codex had to call Fabric MCP tools such as `fabric.search_nodes`, `fabric.get_node`, `fabric.get_neighbors`, and `fabric.expand_node_code` to find the relevant architecture nodes itself.

`Codex task` is the wall-clock time for `codex exec` to inspect the repo and produce the final answer. The Codex runs used `gpt-5.5`, read-only sandboxing, and no file edits.

| Task | Workflow | Codex task | Tokens used | Result |
| --- | --- | ---: | ---: | --- |
| Simple feature planning | Regular prompt | 54.76 s | 72,602 | Found the projects command and test path |
| Simple feature planning | Fabric MCP discovery | 37.53 s | 38,511 | Found `unknown.projects` and `test.projects` through MCP |
| Deep feature explanation | Regular prompt | 83.07 s | 97,547 | Explained target merging from raw source search |
| Deep feature explanation | Fabric MCP discovery | 98.29 s | 129,736 | Discovered and explained target merging nodes through MCP |
| Cross-cutting discovery | Regular prompt | 91.07 s | 90,558 | Traced project configuration loading through source search |
| Cross-cutting discovery | Fabric MCP discovery | 104.88 s | 153,498 | Traced project configuration loading through MCP graph expansion |
| Long target-defaults investigation | Regular prompt | 99.04 s | 89,898 | Investigated target-defaults support from raw source search |
| Long target-defaults investigation | Fabric MCP discovery | 83.28 s | 157,150 | Found target-defaults schema, utility, and test nodes through MCP |

Summary:

| Task | Codex time change | Token change |
| --- | ---: | ---: |
| Simple feature planning | 31.5% faster | 47.0% fewer |
| Deep feature explanation | 18.3% slower | 33.0% more |
| Cross-cutting discovery | 15.2% slower | 69.5% more |
| Long target-defaults investigation | 15.9% faster | 74.8% more |

Fabric still does not beat `rg` at raw local text search. The gain is at the agent-context layer when the graph points the model at relevant ownership and dependency structure. Autonomous MCP discovery is a stricter benchmark than supplying node IDs up front: focused tasks improved, while broad exploratory planning spent extra tokens on MCP search and graph expansion before answering.

### Codex edit benchmarks

These benchmarks let Codex edit files in isolated copies of the same Nx checkout. The first feature is intentionally small. The second is deeper and touches command registration, handler behavior, conflicts, and tests.

#### Small edit: sorted JSON output

```txt
Implement the smallest code change to make `nx show projects --json` return project names in sorted order, and update the relevant unit test.
```

Both runs changed the same implementation file and test file:

```txt
packages/nx/src/command-line/show/projects.ts
packages/nx/src/command-line/show/projects.spec.ts
```

Both runs implemented the same behavior:

```ts
console.log(JSON.stringify(Array.from(selectedProjects).sort()));
```

| Workflow | Starting context | Codex edit time | Tokens used | Result |
| --- | --- | ---: | ---: | --- |
| Regular prompt | Repository search from scratch; `.fab` removed | 154.08 s | 66,356 | Correct implementation and test update |
| Fabric MCP discovery | Codex discovered Fabric nodes through MCP; no node IDs supplied up front | 72.50 s | 69,472 | Correct implementation and test update |

Fabric MCP discovery reduced Codex edit time by **53.0%** on this small feature, with **4.7%** more token usage. The task was small enough that the MCP search overhead was visible in tokens, but it still cut the end-to-end edit time substantially.

Validation note: both isolated Nx edit checkouts lacked local package-manager tooling for the full Nx test command. Codex reported the intended focused validation but could not run it because `pnpm` was unavailable and `npx` attempted registry access. The diffs were limited to the implementation and unit test.

#### Deeper edit: new `--count` option

```txt
Implement a new `--count` option for `nx show projects`.
```

Expected behavior:

```txt
- `nx show projects --count` prints only the number of selected projects.
- The count respects existing filters such as `--affected`, `--projects`, `--withTarget`, `--type`, and `--exclude`.
- `--count` conflicts with `--json` and `--sep`.
- Relevant unit tests are updated.
```

Both runs changed the core implementation files:

```txt
packages/nx/src/command-line/show/command-object.ts
packages/nx/src/command-line/show/projects.ts
packages/nx/src/command-line/show/projects.spec.ts
```

Both runs implemented the same core behavior:

```ts
if (args.count) {
  console.log(selectedProjects.size);
} else if (args.json) {
  console.log(JSON.stringify(Array.from(selectedProjects)));
}
```

| Workflow | Starting context | Codex edit time | Tokens used | Result |
| --- | --- | ---: | ---: | --- |
| Regular prompt | Repository search from scratch; `.fab` removed | 274.85 s | 135,199 | Correct core implementation; also left an extra untracked command-object spec attempt |
| Fabric MCP discovery | Codex discovered Fabric nodes through MCP; no node IDs supplied up front | 184.07 s | 107,454 | Correct implementation and focused tests |

Fabric MCP discovery reduced Codex edit time by **33.0%** and token usage by **20.5%** on this deeper feature. The benefit was larger because Fabric helped Codex find where the command is registered, where selected projects are produced, and where behavior is tested without pre-supplying those files or nodes.

Validation note: both isolated Nx edit checkouts still lacked package-manager tooling for the full Nx test command. Codex ran `git diff --check` successfully in the Fabric MCP discovery run, but could not run the focused Nx/Jest test because `pnpm` was unavailable and `npx` attempted registry access.

#### 1. Simple feature planning

Task prompt:

```txt
In the Nx repository, plan the smallest change to make `nx show projects --json` return project names in sorted order.
```

Observed output from regular prompting:

```txt
Edit packages/nx/src/command-line/show/projects.ts.
Create a sorted array from selectedProjects before output.
Use that array for json, sep, and plain output paths.
Update packages/nx/src/command-line/show/projects.spec.ts to cover sorted JSON output.
```

Observed output from Fabric MCP discovery:

```txt
MCP-discovered Fabric nodes:
- unknown.projects -> packages/nx/src/command-line/show/projects.ts
- test.projects -> packages/nx/src/command-line/show/projects.spec.ts

Implementation plan:
sort only the JSON output path with Array.from(selectedProjects).sort().
Update the JSON output test in projects.spec.ts.
```

#### 2. Deep nested feature explanation

Task prompt:

```txt
Find and explain the deep target-configuration merge behavior in Nx, especially how `mergeTargetConfigurations` handles `...` spread syntax, options, configurations, metadata, and incompatible executors.
```

Observed output from regular prompting:

```txt
Relevant implementation:
- packages/nx/src/project-graph/utils/project-configuration/target-merging.ts
- packages/nx/src/project-graph/utils/project-configuration/target-merging.spec.ts

Explanation:
mergeTargetConfigurations checks executor compatibility first. Compatible targets merge top-level keys, options, and configurations; incompatible targets discard base options/configurations. The `...` sentinel changes merge order so keys before it let the base win and keys after it let the higher-priority target win. Source maps are updated as merged values are written. Metadata is merged separately, with arrays appended and nested values tracked.
```

Observed output from Fabric MCP discovery:

```txt
MCP-discovered Fabric nodes:
- utility.target.merging -> packages/nx/src/project-graph/utils/project-configuration/target-merging.ts
- test.target.merging -> packages/nx/src/project-graph/utils/project-configuration/target-merging.spec.ts

Explanation:
The feature is isolated in target-merging.ts. `mergeTargetConfigurations` splits base options/configurations from other target properties, checks compatibility with `isCompatibleTarget`, uses `NX_SPREAD_TOKEN` to preserve authored merge order, delegates nested option/configuration merging to helper functions, records source-map ownership, and merges metadata after the main target body.
```

#### 3. Cross-cutting project-configuration discovery

Task prompt:

```txt
In the Nx repository, identify the source files an agent should inspect to change how project.json/workspace.json project configuration feeds project graph creation.
```

Observed output from regular prompting:

```txt
Relevant files:
- packages/nx/src/config/workspace-json-project-json.ts
- packages/nx/src/project-graph/utils/project-configuration-utils.ts
- packages/nx/src/project-graph/project-graph.ts
- packages/workspace/src/core/project-graph.ts
```

Observed output from Fabric MCP discovery:

```txt
MCP-discovered Fabric nodes:
- utility.workspace.json.project.json -> packages/nx/src/config/workspace-json-project-json.ts
- utility.project.configuration.utils -> packages/nx/src/project-graph/utils/project-configuration-utils.ts
- unknown.project.graph -> packages/nx/src/project-graph/project-graph.ts, packages/workspace/src/core/project-graph.ts
```

#### 4. Long target-defaults investigation

Task prompt:

```txt
Produce an investigation plan for changing Nx target defaults so the array-form `targetDefaults` supports an additional `projects` filter in merge/apply behavior, while preserving existing executor, target-name, and plugin matching semantics.
```

Observed output from regular prompting:

```txt
Relevant files:
- packages/nx/src/project-graph/utils/project-configuration/target-defaults.ts
- packages/nx/src/project-graph/utils/project-configuration/target-defaults.spec.ts
- packages/nx/src/project-graph/utils/project-configuration/target-merging.ts
- packages/nx/src/project-graph/utils/project-configuration/project-nodes-manager.ts
- packages/nx/src/config/nx-json.ts
- packages/nx/schemas/nx-schema.json

Plan:
verify existing array-form `projects` support, keep matching centralized in target-defaults.ts, preserve executor/target/plugin specificity, and validate with focused target-defaults tests plus Nx affected checks.
```

Observed output from Fabric MCP discovery:

```txt
MCP-discovered Fabric nodes:
- utility.target.defaults -> packages/nx/src/project-graph/utils/project-configuration/target-defaults.ts
- test.target.defaults -> packages/nx/src/project-graph/utils/project-configuration/target-defaults.spec.ts
- utility.target.merging -> packages/nx/src/project-graph/utils/project-configuration/target-merging.ts
- utility.project.nodes.manager -> packages/nx/src/project-graph/utils/project-configuration/project-nodes-manager.ts

Plan:
verify existing `projects` filter behavior end to end, patch only uncovered gaps, keep `projects` as a filter rather than merge payload, preserve source-map/plugin specificity, and validate target-defaults, target-merging, project-node manager, affected, and prepush flows.
```

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

If source files changed during the work, refresh the generated overlay first:

```sh
fab scan
fab validate
```

Use `fabric.rebuild_graph` for MCP-authored node changes. Use `fab scan` when the source tree itself changed.

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
