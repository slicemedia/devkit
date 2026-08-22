let initialized = false;

/** Compose project-owned integrations here when their Webflow markup contract is ready. */
export function initProject(): void {
  if (initialized) return;
  initialized = true;
}

export function refreshProject(): void {
  if (!initialized) return;
}

export function destroyProject(): void {
  if (!initialized) return;
  initialized = false;
}
