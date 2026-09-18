import type { DevKitRuntime } from "./runtime.js";

/** Track before init, expose the public API only after success. Failed instances remain inspectable. */
export async function initializeAddon<
  Instance extends {
    readonly definition: { readonly name: string; readonly version: string };
    init(): Promise<void>;
  },
>(runtime: DevKitRuntime, instance: Instance): Promise<Instance> {
  const registration = runtime.trackAddon({
    name: instance.definition.name,
    version: instance.definition.version,
    value: instance,
  });
  await registration.value.init();
  runtime.registerAddon(registration);
  return registration.value;
}
