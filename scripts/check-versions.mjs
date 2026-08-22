import { checkVersionConsistency } from "./versioning.mjs";

try {
  const result = await checkVersionConsistency();
  console.info(`Version consistency passed for DevKit ${result.version}.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
