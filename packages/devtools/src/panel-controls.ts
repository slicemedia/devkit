import type { DevToolsPreferences } from "./preferences.js";
import { bindWindowFrame } from "./window-frame.js";

interface PanelElements {
  document: Document;
  panel: HTMLElement;
  launcher: HTMLButtonElement;
  toolbar: HTMLElement;
  opacityButton: HTMLButtonElement;
  opacityPopover: HTMLElement;
  opacityInput: HTMLInputElement;
  opacityValue: HTMLOutputElement;
  preferences: DevToolsPreferences;
  savePreferences(changes: DevToolsPreferences): void;
  onResize(): void;
}

/** Owns only inspector UI state and releases every listener and pointer capture on cleanup. */
export function bindPanelControls(elements: PanelElements): {
  toggleOpacity(): void;
  dismissOpacity(restoreFocus?: boolean): boolean;
  constrainPosition(): void;
  stopDragging(): void;
  cleanup(): void;
} {
  const { document, panel, toolbar, opacityButton, opacityPopover, opacityInput, opacityValue } =
    elements;
  const frame = bindWindowFrame(elements);
  const dismissOpacity = (restoreFocus = false): boolean => {
    if (opacityPopover.hidden) return false;
    opacityPopover.hidden = true;
    opacityButton.setAttribute("aria-expanded", "false");
    if (restoreFocus) opacityButton.focus();
    return true;
  };

  const applyOpacity = (opacity: number): void => {
    opacityInput.value = String(opacity);
    panel.style.opacity = String(opacity / 100);
    opacityValue.value = `${opacity}%`;
    opacityInput.setAttribute("aria-valuetext", `${opacity}%`);
  };

  applyOpacity(Math.round((elements.preferences.opacity ?? 1) * 100));
  const handleOpacityInput = (): void => {
    const opacity = Math.max(20, Math.min(100, Number(opacityInput.value)));
    applyOpacity(opacity);
    elements.savePreferences({ opacity: opacity / 100 });
  };

  const handleToolbarDown = (event: PointerEvent): void => {
    if (
      !event.composedPath().includes(opacityPopover) &&
      !event.composedPath().includes(opacityButton)
    )
      dismissOpacity();
  };

  const handleOutsidePointer = (event: PointerEvent): void => {
    const path = event.composedPath();
    if (!path.includes(opacityPopover) && !path.includes(opacityButton)) dismissOpacity();
  };

  const handleFocus = (event: FocusEvent): void => {
    const path = event.composedPath();
    if (!path.includes(opacityPopover) && !path.includes(opacityButton)) dismissOpacity();
  };

  toolbar.addEventListener("pointerdown", handleToolbarDown);
  opacityInput.addEventListener("input", handleOpacityInput);
  document.addEventListener("pointerdown", handleOutsidePointer, true);
  document.addEventListener("focusin", handleFocus, true);

  return {
    toggleOpacity() {
      if (dismissOpacity(true)) return;
      opacityPopover.hidden = false;
      opacityButton.setAttribute("aria-expanded", "true");
      opacityInput.focus();
    },
    dismissOpacity,
    constrainPosition: frame.constrainPosition,
    stopDragging: frame.stopDragging,
    cleanup() {
      frame.cleanup();
      toolbar.removeEventListener("pointerdown", handleToolbarDown);
      opacityInput.removeEventListener("input", handleOpacityInput);
      document.removeEventListener("pointerdown", handleOutsidePointer, true);
      document.removeEventListener("focusin", handleFocus, true);
    },
  };
}
