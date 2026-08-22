import { syncVersionFiles } from "./versioning.mjs";

const result = await syncVersionFiles();
if (result.written.length === 0) {
  console.info(`Version files already match DevKit ${result.version}.`);
} else {
  console.info(`Synchronized DevKit ${result.version}: ${result.written.join(", ")}.`);
}
