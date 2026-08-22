import "./styles.css";
import { initProject } from "./project.js";

const start = (): void => {
  initProject();
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start, { once: true });
} else {
  start();
}
