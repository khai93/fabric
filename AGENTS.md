# Fabric Agent Notes

Fabric is a Bun + TypeScript monorepo. Use Bun commands and avoid npm, pnpm, or yarn unless there is a clear reason.

Source files remain the source of truth. The `.fab/` directory is generated overlay output for architecture indexing and AI context. Do not treat generated graph, node, summary, ownership, or dependency files as replacements for source code.

Fabric v0.3 focuses on MCP-assisted AI node generation. AI clients should use MCP write tools rather than manually editing `.fab` files when MCP is available.

MCP stdout must stay protocol-clean; send human-readable MCP logs and diagnostics to stderr only.

Do not add internal AI API calls, embeddings, telemetry, cloud services, visual editors, graph-native execution, file reorganization, or automatic code editing unless explicitly requested.

Do not move user source files. Source files remain the source of truth and `.fab/` remains generated overlay output.

Run validation after node generation.

When changing code:

- Prefer small, deterministic, testable changes.
- Avoid heavy dependencies.
- Run `bunx tsc --noEmit` when possible.
- Use `bun test` for tests.
- Keep `.fab/` output deterministic and git-friendly.
- Update scanner output logic and tests together when changing inference behavior.
