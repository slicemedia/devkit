import { CORE_VERSION, installDevKitRuntime, onDomReady } from "@slicemedia/devkit-core";

import { createCounter } from "../counter.js";

const installation = installDevKitRuntime({ version: CORE_VERSION });
if (installation.status === "conflict")
  throw new Error("Another DevKit runtime version is active.");
const { runtime } = installation;

onDomReady(() => {
  runtime.queue.push(async () => {
    if (runtime.getAddon("counter")) return;
    const configured = runtime.config.counter;
    let options = {};
    if (configured !== undefined) {
      if (typeof configured !== "object" || configured === null || Array.isArray(configured))
        throw new TypeError("Counter configuration must be an object.");
      if ("duration" in configured) {
        if (
          typeof configured.duration !== "number" ||
          !Number.isFinite(configured.duration) ||
          configured.duration < 0
        )
          throw new TypeError("Counter duration must be a non-negative finite number.");
        options = { duration: configured.duration };
      }
    }
    const counter = createCounter(options);
    await counter.init();
    runtime.registerAddon({ name: "counter", version: counter.definition.version, value: counter });
  });
  void runtime.ready.catch((error: unknown) => console.error(error));
});
