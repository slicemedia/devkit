import { CORE_VERSION, installDevKitRuntime, onDomReady } from "@slicemedia/devkit-core";

import { createCounter } from "../counter.js";

const installation = installDevKitRuntime({ version: CORE_VERSION });
if (installation.status === "conflict")
  throw new Error("Another DevKit runtime version is active.");
const { runtime } = installation;

onDomReady(() => {
  runtime.queue.push(async () => {
    if (runtime.getAddon("counter")) return;
    const counter = createCounter();
    await counter.init();
    runtime.registerAddon({ name: "counter", version: counter.definition.version, value: counter });
  });
  void runtime.ready.catch((error: unknown) => console.error(error));
});
