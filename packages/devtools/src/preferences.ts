export const preferencesKey = "slicemedia.devtools.v1";

export interface DevToolsPreferences {
  enabled?: boolean;
  width?: number;
  height?: number;
  opacity?: number;
}

/** A read never creates, repairs, or migrates storage. Writes require an explicit interaction. */
export function readPreferences(window: Window): DevToolsPreferences {
  try {
    const raw = window.localStorage.getItem(preferencesKey);
    if (!raw) return {};
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || !("version" in value) || value.version !== 1)
      return {};
    const result: DevToolsPreferences = {};
    if ("enabled" in value && typeof value.enabled === "boolean") result.enabled = value.enabled;
    for (const key of ["width", "height", "opacity"] as const) {
      const number = key in value ? (value as Record<string, unknown>)[key] : undefined;
      if (typeof number !== "number" || !Number.isFinite(number)) continue;
      if (key === "opacity" ? number >= 0.2 && number <= 1 : number >= 120 && number <= 16384) {
        result[key] = number;
      }
    }
    return result;
  } catch {
    return {};
  }
}

export function writePreferences(window: Window, preferences: DevToolsPreferences): void {
  try {
    window.localStorage.setItem(preferencesKey, JSON.stringify({ version: 1, ...preferences }));
  } catch {
    // Private browsing, blocked storage, and quotas must not break the inspector or write elsewhere.
  }
}

export function isWebflowStaging(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/u, "");
  return host === "webflow.io" || host.endsWith(".webflow.io");
}
