# Fabric Agent Notes

Fabric is a Bun TypeScript monorepo. Use Bun commands and avoid npm, pnpm, or yarn unless there is a clear reason.

Source files remain the source of truth. The `.fab/` directory is generated overlay output for architecture indexing and AI context. Do not treat generated graph, node, summary, ownership, or dependency files as replacements for source code.

Do not implement MCP until explicitly requested. Milestone 1 is the deterministic scanner, CLI skeleton, and generated overlay files only.

When changing code:

- Prefer small, deterministic, testable changes.
- Avoid heavy dependencies.
- Run `bunx tsc --noEmit` when possible.
- Use `bun test` for tests.
- Keep `.fab/` output deterministic and git-friendly.
- Update scanner output logic and tests together when changing inference behavior.
