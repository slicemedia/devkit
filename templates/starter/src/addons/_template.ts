// Files beginning with _ are ignored by addon discovery. Copy to feature.ts,
// rename the definition module, and update this import when implementing an addon.
import {
  CORE_VERSION,
  initializeAddon,
  installDevKitRuntime,
  onDomReady,
} from "@slicemedia/devkit-core";
import { createFeature } from "../features/_template.js";

const installation = installDevKitRuntime({ version: CORE_VERSION });
if (installation.status === "conflict")
  throw new Error("Another DevKit runtime version is active.");
const { runtime } = installation;
onDomReady(() => {
  runtime.queue.push(async () => {
    await initializeAddon(runtime, createFeature());
  });
  void runtime.ready.catch((error: unknown) => console.error(error));
});
