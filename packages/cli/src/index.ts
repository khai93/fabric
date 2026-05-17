#!/usr/bin/env bun
import { initCommand } from "./commands/init";
import { mcpCommand } from "./commands/mcp";
import { scanCommand } from "./commands/scan";
import { statusCommand } from "./commands/status";
import { validateCommand } from "./commands/validate";
import { generateCommand } from "./commands/generate";

const command = process.argv[2];

try {
  switch (command) {
    case "init":
      await initCommand();
      break;
    case "scan":
      await scanCommand();
      break;
    case "status":
      await statusCommand();
      break;
    case "mcp":
      await mcpCommand();
      break;
    case "validate":
      await validateCommand();
      break;
    case "generate":
      await generateCommand(process.argv.slice(3));
      break;
    case undefined:
    case "help":
    case "--help":
    case "-h":
      printHelp();
      break;
    default:
      console.error(`Unknown command: ${command}`);
      printHelp();
      process.exitCode = 1;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

function printHelp(): void {
  console.log(`Fabric CLI

Usage:
  fabric init
  fabric scan
  fabric status
  fabric mcp
  fabric validate
  fabric generate --prompt

Local development:
  bun run packages/cli/src/index.ts init
  bun run packages/cli/src/index.ts scan
  bun run packages/cli/src/index.ts status
  bun run packages/cli/src/index.ts mcp
  bun run packages/cli/src/index.ts validate
  bun run packages/cli/src/index.ts generate --prompt
`);
}
