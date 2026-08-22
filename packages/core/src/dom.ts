/**
 * Runs a callback once the target document is interactive. Already-ready and document-free
 * environments run on the next microtask, preserving consistent asynchronous behavior.
 */
export function onDomReady(callback: () => void, targetDocument?: Document): () => void {
  const resolvedDocument =
    targetDocument ?? (typeof document === "undefined" ? undefined : document);
  let active = true;

  const run = () => {
    if (!active) return;
    active = false;
    resolvedDocument?.removeEventListener("DOMContentLoaded", run);
    callback();
  };

  if (resolvedDocument?.readyState === "loading") {
    resolvedDocument.addEventListener("DOMContentLoaded", run, { once: true });
  } else {
    queueMicrotask(run);
  }

  return () => {
    if (!active) return;
    active = false;
    resolvedDocument?.removeEventListener("DOMContentLoaded", run);
  };
}

/** Resolves when the target document is ready. */
export function whenDomReady(targetDocument?: Document): Promise<void> {
  return new Promise((resolve) => {
    onDomReady(resolve, targetDocument);
  });
}
