import { createDevTools } from "../src/index.js";

// This explicit browser entry is the only auto-installing DevTools artifact.
// Repeated includes keep the existing controller and its preference state.
if (!("DevKitDevTools" in window)) {
  const nonce = (document.currentScript as HTMLScriptElement | null)?.nonce;
  createDevTools(nonce ? { nonce } : {}).init();
}
