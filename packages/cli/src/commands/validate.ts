import { validateFabric } from "@fabric/core";

export async function validateCommand(projectRoot = process.cwd()): Promise<void> {
  const result = await validateFabric(projectRoot);

  if (result.ok) {
    console.log(`Fabric validation passed with ${result.warningCount} warning(s).`);
  } else {
    console.log(`Fabric validation failed with ${result.errorCount} error(s) and ${result.warningCount} warning(s).`);
  }

  for (const error of result.errors) {
    console.log(`ERROR ${error.code}: ${error.message}`);
  }

  for (const warning of result.warnings) {
    console.log(`WARN ${warning.code}: ${warning.message}`);
  }

  if (!result.ok) {
    process.exitCode = 1;
  }
}
