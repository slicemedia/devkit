import { inspectDevKit } from "./inspect.js";
import { bindDrawerResize } from "./drawer-resize.js";
import { createToolbarIcon, type ToolbarIcon } from "./icons.js";
import { bindPanelControls } from "./panel-controls.js";
import { renderMarkupStructure } from "./render-structure.js";
import { renderDiagnostics } from "./render-diagnostics.js";
import { styles } from "./styles.js";
import { createWebflowMark } from "./webflow-mark.js";
import type { DevToolsPreferences } from "./preferences.js";
import type { DevToolsAddonInspection, DevToolsRegistration, DevToolsSnapshot } from "./types.js";

export interface InspectorOptions {
  document: Document;
  addons(): readonly DevToolsRegistration[];
  nonce?: string;
  preferences: DevToolsPreferences;
  savePreferences(changes: DevToolsPreferences): void;
}

export interface InspectorController {
  init(): void;
  open(): void;
  close(): void;
  refresh(): DevToolsSnapshot;
  getSnapshot(): DevToolsSnapshot | undefined;
  destroy(): void;
}

interface View {
  document: Document;
  host: HTMLElement;
  shadow: ShadowRoot;
  launcher: HTMLButtonElement;
  panel: HTMLElement;
  sidebar: HTMLElement;
  content: HTMLElement;
  unclaimed: HTMLDetailsElement;
  unclaimedCount: HTMLElement;
  unclaimedContent: HTMLElement;
  summary: HTMLElement;
  closeButton: HTMLButtonElement;
  highlight: HTMLElement;
  controls: ReturnType<typeof bindPanelControls>;
  drawerResize: ReturnType<typeof bindDrawerResize>;
  resetRescanFeedback(): void;
  cleanup(): void;
}

const mounted = new WeakMap<Document, InspectorController>();

/** UI implementation created only after the bootstrap's activation policy allows it. */
export function createInspector(options: InspectorOptions): InspectorController {
  let view: View | undefined;
  let snapshot: DevToolsSnapshot | undefined;
  let clearHighlight = (): void => {};
  let previousFocus: Element | null = null;
  let selectedAddon = 0;
  const expandedByAddon = new Map<string, Map<string, boolean>>();
  let renderedAddonKey: string | undefined;
  const actions = new WeakMap<EventTarget, () => void>();

  const resolveDocument = (): Document => {
    const resolved = options.document ?? (typeof document === "undefined" ? undefined : document);
    if (!resolved) throw new Error("DevKit DevTools requires a browser document.");
    return resolved;
  };

  const locate = (element: Element): void => {
    clearHighlight();
    const activeView = view;
    const window = activeView?.document.defaultView;
    if (!activeView || !window) return;
    if (!element.isConnected || element.ownerDocument !== activeView.document) {
      activeView.summary.textContent = "That element is no longer on this page. Rescan to update.";
      return;
    }
    element.scrollIntoView?.({ block: "center", inline: "nearest", behavior: "instant" });
    const update = (): void => {
      const rect = element.getBoundingClientRect();
      activeView.highlight.hidden = rect.width === 0 || rect.height === 0;
      Object.assign(activeView.highlight.style, {
        left: `${rect.left}px`,
        top: `${rect.top}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
      });
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    const timer = window.setTimeout(() => clearHighlight(), 2500);
    clearHighlight = () => {
      window.clearTimeout(timer);
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
      activeView.highlight.hidden = true;
      clearHighlight = () => {};
    };
  };

  const node = <Tag extends keyof HTMLElementTagNameMap>(
    document: Document,
    tag: Tag,
    className: string,
    text?: string,
  ): HTMLElementTagNameMap[Tag] => {
    const element = document.createElement(tag);
    element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  };

  const button = (
    document: Document,
    text: string,
    action: () => void,
    className = "action",
  ): HTMLButtonElement => {
    const element = node(document, "button", className, text);
    element.type = "button";
    actions.set(element, action);
    return element;
  };

  const iconButton = (
    document: Document,
    label: string,
    icon: ToolbarIcon,
    action: () => void,
  ): HTMLButtonElement => {
    const element = button(document, "", action, "action icon-action");
    element.setAttribute("aria-label", label);
    element.title = label;
    element.append(createToolbarIcon(document, icon));
    return element;
  };

  const renderAddon = (document: Document, addon: DevToolsAddonInspection): HTMLElement => {
    const details = node(document, "section", "addon");
    const heading = node(document, "div", "addon-heading");
    const name = node(document, "h3", "name", addon.label);
    name.append(node(document, "span", "version", `v${addon.version}`));
    const status = node(document, "span", "status", addon.status);
    status.dataset.status = addon.status;
    heading.append(name, status);
    details.append(heading, node(document, "p", "description", addon.description));
    const scope =
      addon.coverage === "global"
        ? "Global service · no component markup required"
        : addon.roots === undefined
          ? "Document inventory · no root contract"
          : `${addon.roots.length} matching root${addon.roots.length === 1 ? "" : "s"}`;
    details.append(node(document, "p", "muted", scope));
    if (addon.roots?.length === 0 && !addon.issues.some((issue) => issue.severity === "error")) {
      details.append(node(document, "p", "muted", "Not used on this page."));
    }
    const generalIssues = addon.issues.filter((issue) => !issue.structureNode);
    for (const issue of generalIssues.slice(0, 50)) {
      const item = node(document, "div", "issue", issue.message);
      item.dataset.severity = issue.severity;
      const element = issue.element;
      if (element) item.append(button(document, "Locate", () => locate(element), "locate"));
      details.append(item);
    }
    if (generalIssues.length > 50) {
      details.append(
        node(
          document,
          "p",
          "muted",
          `Showing 50 of ${generalIssues.length} findings. The snapshot contains all findings.`,
        ),
      );
    }
    const key = `${selectedAddon}:${addon.name}:${addon.label}`;
    const expanded = expandedByAddon.get(key) ?? new Map<string, boolean>();
    expandedByAddon.set(key, expanded);
    details.append(
      renderMarkupStructure({
        document,
        addon,
        expanded,
        locate: (element, label) => button(document, label, () => locate(element), "locate"),
      }),
    );
    if (addon.instances?.length)
      details.append(
        renderDiagnostics(document, addon, expanded, (element, label) =>
          button(document, label, () => locate(element), "locate"),
        ),
      );
    renderedAddonKey = key;
    return details;
  };

  const renderSelectedAddon = (): void => {
    if (!view || !snapshot) return;
    if (renderedAddonKey) {
      const expanded = expandedByAddon.get(renderedAddonKey);
      for (const item of view.content.querySelectorAll<HTMLDetailsElement>(
        "details[data-disclosure]",
      )) {
        expanded?.set(item.dataset.disclosure!, item.open);
      }
    }
    const addon = snapshot.addons[selectedAddon];
    view.content.setAttribute("aria-label", addon ? `${addon.label} details` : "Addon details");
    view.content.replaceChildren(
      addon
        ? renderAddon(view.document, addon)
        : node(
            view.document,
            "p",
            "empty",
            "No addons registered. Pass addon instances to createDevTools() in your project entry.",
          ),
    );
    if (snapshot.scriptWarnings.length > 0) {
      const section = node(view.document, "section", "script-warnings");
      section.setAttribute("aria-label", "Page script warnings");
      section.append(node(view.document, "h3", "", "Page script warnings"));
      for (const warning of snapshot.scriptWarnings.slice(0, 50)) {
        const item = node(view.document, "div", "issue", warning.message);
        item.dataset.severity = "warning";
        item.append(node(view.document, "code", "script-url", warning.src));
        const locations = warning.elements.map((element) =>
          element.closest("head") ? "head" : "body",
        );
        const inHead = locations.filter((location) => location === "head").length;
        item.append(
          node(
            view.document,
            "p",
            "script-locations",
            `${inHead} in head · ${locations.length - inHead} in body`,
          ),
        );
        section.append(item);
      }
      if (snapshot.scriptWarnings.length > 50) {
        section.append(
          node(
            view.document,
            "p",
            "muted",
            `Showing 50 of ${snapshot.scriptWarnings.length} script warnings. The snapshot contains all warnings.`,
          ),
        );
      }
      view.content.prepend(section);
    }
    [...view.sidebar.querySelectorAll("button")].forEach((item, index) => {
      if (index === selectedAddon) item.setAttribute("aria-current", "true");
      else item.removeAttribute("aria-current");
    });
  };

  const render = (): void => {
    if (!view || !snapshot) return;
    const { document, sidebar, content, summary, unclaimed, unclaimedCount, unclaimedContent } =
      view;
    const sidebarScroll = sidebar.scrollTop;
    const contentScroll = content.scrollTop;
    const issueCount = snapshot.addons.reduce(
      (count, addon) => count + addon.issues.filter((issue) => issue.severity === "error").length,
      0,
    );
    const warningCount =
      snapshot.scriptWarnings.length +
      snapshot.addons.reduce(
        (count, addon) =>
          count + addon.issues.filter((issue) => issue.severity === "warning").length,
        0,
      );
    const warnings = warningCount
      ? ` · ${warningCount} warning${warningCount === 1 ? "" : "s"}`
      : "";
    summary.textContent = `${snapshot.addons.length} addon${snapshot.addons.length === 1 ? "" : "s"} · ${issueCount} issue${issueCount === 1 ? "" : "s"}${warnings} · ${snapshot.unclaimedAttributes.length} unclaimed hook${snapshot.unclaimedAttributes.length === 1 ? "" : "s"}`;
    const links = document.createDocumentFragment();
    links.append(node(document, "h3", "sidebar-heading", "Addons"));
    snapshot.addons.forEach((addon, index) => {
      const link = button(
        document,
        "",
        () => {
          selectedAddon = index;
          renderSelectedAddon();
          if (view) view.content.scrollTop = 0;
        },
        "addon-link",
      );
      link.setAttribute("aria-controls", "devkit-addon-details");
      link.append(node(document, "span", "name", addon.label));
      const issueCount = addon.issues.filter((issue) => issue.severity === "error").length;
      const warningCount = addon.issues.filter((issue) => issue.severity === "warning").length;
      const meta = node(document, "span", "addon-link-meta");
      meta.append(node(document, "span", "", addon.status));
      if (issueCount)
        meta.append(
          node(
            document,
            "span",
            "issue-count",
            `${issueCount} issue${issueCount === 1 ? "" : "s"}`,
          ),
        );
      if (warningCount)
        meta.append(
          node(
            document,
            "span",
            "warning-count",
            `${warningCount} warning${warningCount === 1 ? "" : "s"}`,
          ),
        );
      link.append(meta);
      links.append(link);
    });
    sidebar.replaceChildren(links);
    sidebar.scrollTop = sidebarScroll;
    selectedAddon = Math.min(selectedAddon, Math.max(0, snapshot.addons.length - 1));
    renderSelectedAddon();
    content.scrollTop = contentScroll;

    unclaimed.hidden = snapshot.unclaimedAttributes.length === 0;
    unclaimedCount.textContent = String(snapshot.unclaimedAttributes.length);
    const unknown = document.createDocumentFragment();
    if (!unclaimed.hidden) {
      unknown.append(
        node(
          document,
          "p",
          "muted",
          "No registered addon declares these hooks. Another script may own them; they are not automatically errors.",
        ),
      );
      for (const attribute of snapshot.unclaimedAttributes) {
        const item = node(document, "div", "attribute");
        item.append(node(document, "code", "", attribute.name));
        const meta = node(document, "div", "attribute-meta");
        meta.append(node(document, "span", "muted", `${attribute.elements.length} found`));
        const first = attribute.elements[0];
        if (first) meta.append(button(document, "Locate first", () => locate(first), "locate"));
        item.append(meta);
        unknown.append(item);
      }
    }
    unclaimedContent.replaceChildren(unknown);
    view.drawerResize.refresh();
  };

  const controller: InspectorController = {
    init() {
      if (view) return;
      const document = resolveDocument();
      if (!document.body)
        throw new Error("Initialize DevKit DevTools after the document body is ready.");
      if (mounted.has(document))
        throw new Error("A DevKit inspector is already mounted in this document.");
      const host = document.createElement("div");
      host.setAttribute("data-wft-devtools", "");
      const shadow = host.attachShadow({ mode: "open" });
      const style = document.createElement("style");
      if (options.nonce) style.setAttribute("nonce", options.nonce);
      style.textContent = styles;
      const shell = node(document, "div", "shell");
      const launcher = button(
        document,
        "",
        () => (view?.panel.hidden ? controller.open() : controller.close()),
        "launcher",
      );
      launcher.setAttribute("aria-label", "Open DevKit inspector");
      launcher.setAttribute("aria-expanded", "false");
      launcher.setAttribute("aria-controls", "devkit-panel");
      launcher.setAttribute("aria-haspopup", "dialog");
      launcher.title = "Toggle DevKit inspector";
      const launcherFace = node(document, "span", "launcher-face");
      launcherFace.setAttribute("aria-hidden", "true");
      launcherFace.append(createWebflowMark(document));
      launcher.append(launcherFace);
      const panel = node(document, "section", "panel");
      panel.id = "devkit-panel";
      panel.hidden = true;
      panel.setAttribute("role", "dialog");
      panel.setAttribute("aria-label", "DevKit inspector");
      const header = node(document, "div", "header");
      const heading = node(document, "div", "heading");
      heading.tabIndex = 0;
      heading.setAttribute("role", "group");
      heading.setAttribute(
        "aria-label",
        "Move inspector. Drag or use arrow keys; Shift moves faster.",
      );
      heading.title = "Drag to move · arrow keys when focused";
      const headerActions = node(document, "div", "actions");
      const closeButton = iconButton(document, "Close", "x", () => controller.close());
      const opacityButton = iconButton(document, "Panel opacity", "blend", () =>
        view?.controls.toggleOpacity(),
      );
      opacityButton.setAttribute("aria-expanded", "false");
      opacityButton.setAttribute("aria-controls", "devkit-opacity");
      opacityButton.setAttribute("aria-haspopup", "dialog");
      const opacityPopover = node(document, "div", "opacity-popover");
      opacityPopover.id = "devkit-opacity";
      opacityPopover.hidden = true;
      opacityPopover.setAttribute("role", "dialog");
      opacityPopover.setAttribute("aria-label", "Panel opacity");
      const opacityLabel = node(document, "label", "", "Opacity");
      opacityLabel.htmlFor = "devkit-opacity-slider";
      const opacityValue = node(document, "output", "", "100%");
      opacityValue.htmlFor.value = "devkit-opacity-slider";
      const opacityRow = node(document, "div", "opacity-row");
      opacityRow.append(opacityLabel, opacityValue);
      const opacityInput = node(document, "input", "opacity-slider");
      opacityInput.id = "devkit-opacity-slider";
      opacityInput.type = "range";
      opacityInput.min = "20";
      opacityInput.max = "100";
      opacityInput.step = "1";
      opacityInput.value = "100";
      opacityInput.setAttribute("aria-valuetext", "100%");
      opacityPopover.append(opacityRow, opacityInput);
      let rescanTimer: number | undefined;
      const resetRescanFeedback = (): void => {
        if (rescanTimer !== undefined) document.defaultView?.clearTimeout(rescanTimer);
        rescanTimer = undefined;
        rescanButton.classList.remove("rescan-success");
        rescanButton.title = "Rescan";
      };
      const rescanButton = iconButton(document, "Rescan", "refresh-cw", () => {
        resetRescanFeedback();
        controller.refresh();
        rescanButton.classList.add("rescan-success");
        rescanButton.title = "Scan complete";
        rescanTimer = document.defaultView?.setTimeout(resetRescanFeedback, 900);
      });
      rescanButton.classList.add("rescan-button");
      headerActions.append(rescanButton, opacityButton, closeButton, opacityPopover);
      heading.append(node(document, "h2", "", "DevKit"), headerActions);
      const summary = node(document, "p", "summary");
      summary.setAttribute("role", "status");
      header.append(heading, summary);
      const workspace = node(document, "div", "workspace");
      const sidebar = node(document, "nav", "sidebar");
      sidebar.setAttribute("aria-label", "Registered addons");
      const content = node(document, "div", "content");
      content.id = "devkit-addon-details";
      content.tabIndex = 0;
      content.setAttribute("role", "region");
      content.setAttribute("aria-label", "Addon details");
      workspace.append(sidebar, content);
      const unclaimed = node(document, "details", "unclaimed");
      unclaimed.hidden = true;
      const unclaimedSummary = node(document, "summary", "");
      const unclaimedCount = node(document, "span", "hook-count", "0");
      unclaimedSummary.append(node(document, "span", "", "Unclaimed attributes"), unclaimedCount);
      const unclaimedContent = node(document, "div", "unclaimed-content");
      unclaimedContent.id = "devkit-unclaimed-content";
      unclaimedContent.tabIndex = 0;
      unclaimedContent.setAttribute("role", "region");
      unclaimedContent.setAttribute("aria-label", "Unclaimed attributes");
      const unclaimedResize = node(document, "div", "unclaimed-resize");
      unclaimedResize.tabIndex = 0;
      unclaimedResize.setAttribute("role", "separator");
      unclaimedResize.setAttribute("aria-orientation", "horizontal");
      unclaimedResize.setAttribute("aria-label", "Resize unclaimed attributes");
      unclaimedResize.setAttribute("aria-controls", unclaimedContent.id);
      unclaimedResize.setAttribute("aria-valuemin", "0");
      unclaimedResize.setAttribute("aria-valuemax", "0");
      unclaimedResize.setAttribute("aria-valuenow", "0");
      unclaimedResize.setAttribute(
        "aria-description",
        "Drag or use Up and Down to resize. Double-click or press Enter to restore the default height.",
      );
      unclaimedResize.title = "Drag to resize · double-click to reset";
      unclaimed.append(unclaimedSummary, unclaimedResize, unclaimedContent);
      panel.append(header, workspace, unclaimed);
      const highlight = node(document, "div", "highlight");
      highlight.hidden = true;
      highlight.setAttribute("aria-hidden", "true");
      shell.append(highlight, panel, launcher);
      shadow.append(style, shell);
      const handleKeydown = (event: KeyboardEvent): void => {
        if (event.key !== "Escape" || panel.hidden) return;
        event.preventDefault();
        event.stopPropagation();
        if (view?.controls.dismissOpacity(true)) return;
        controller.close();
      };
      const handleClick = (event: MouseEvent): void => {
        for (const target of event.composedPath()) {
          const action = actions.get(target);
          if (action) {
            action();
            return;
          }
        }
      };
      host.addEventListener("keydown", handleKeydown);
      host.addEventListener("click", handleClick);
      document.body.append(host);
      const controls = bindPanelControls({
        document,
        panel,
        launcher,
        toolbar: heading,
        opacityButton,
        opacityPopover,
        opacityInput,
        opacityValue,
        preferences: options.preferences,
        savePreferences: options.savePreferences,
        onResize: () => view?.drawerResize.refresh(),
      });
      const drawerResize = bindDrawerResize({
        panel,
        header,
        drawer: unclaimed,
        summary: unclaimedSummary,
        content: unclaimedContent,
        handle: unclaimedResize,
      });
      view = {
        document,
        host,
        shadow,
        launcher,
        panel,
        sidebar,
        content,
        unclaimed,
        unclaimedCount,
        unclaimedContent,
        summary,
        closeButton,
        highlight,
        controls,
        drawerResize,
        resetRescanFeedback,
        cleanup() {
          resetRescanFeedback();
          drawerResize.cleanup();
          controls.cleanup();
          host.removeEventListener("keydown", handleKeydown);
          host.removeEventListener("click", handleClick);
        },
      };
      mounted.set(document, controller);
    },
    open() {
      controller.init();
      if (!view || !view.panel.hidden) return;
      previousFocus = view.document.activeElement;
      controller.refresh();
      view.panel.hidden = false;
      view.controls.constrainPosition();
      view.drawerResize.refresh();
      view.launcher.setAttribute("aria-expanded", "true");
      view.launcher.setAttribute("aria-label", "Close DevKit inspector");
      view.closeButton.focus();
    },
    close() {
      if (!view) return;
      clearHighlight();
      view.resetRescanFeedback();
      view.controls.stopDragging();
      view.drawerResize.stopDragging();
      view.controls.dismissOpacity();
      if (view.shadow.activeElement) view.launcher.focus();
      view.panel.hidden = true;
      view.launcher.setAttribute("aria-expanded", "false");
      view.launcher.setAttribute("aria-label", "Open DevKit inspector");
    },
    refresh() {
      clearHighlight();
      snapshot = inspectDevKit({
        document: resolveDocument(),
        addons: options.addons(),
        ...(view ? { exclude: [view.host] } : {}),
      });
      render();
      return snapshot;
    },
    getSnapshot: () => snapshot,
    destroy() {
      clearHighlight();
      if (view) {
        const hadFocus = view.document.activeElement === view.host;
        view.cleanup();
        mounted.delete(view.document);
        view.host.remove();
        if (
          hadFocus &&
          previousFocus?.isConnected &&
          "focus" in previousFocus &&
          typeof previousFocus.focus === "function"
        ) {
          previousFocus.focus();
        }
      }
      view = undefined;
      snapshot = undefined;
      previousFocus = null;
      selectedAddon = 0;
      expandedByAddon.clear();
      renderedAddonKey = undefined;
    },
  };
  return controller;
}
