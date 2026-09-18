export const styles = `
:host { all: initial !important; position: fixed !important; left: 0 !important;
  right: 0 !important; bottom: 0 !important; height: 0 !important;
  z-index: 2147483646 !important; display: block !important; pointer-events: none !important;
  color-scheme: dark; direction: ltr; }
* { box-sizing: border-box; }
[hidden] { display: none !important; }
.shell { font: 13px/1.5 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  color: #f0f0f0; text-align: left; }
button { font: inherit; cursor: pointer; color: inherit; }
button:not(.launcher):focus-visible, summary:focus-visible, [tabindex]:focus-visible, input:focus-visible {
  outline: 2px solid #80adff; outline-offset: 3px; }
/* Keep the hit target stationary while the small visual tab lifts within it. */
.launcher { position: absolute; left: 50%; bottom: 0; margin: 0 0 0 -22px;
  display: block; width: 44px; height: 44px; padding: 0; border: 0;
  background: transparent; color: #146ef5; outline: none; pointer-events: auto;
  touch-action: manipulation; -webkit-tap-highlight-color: transparent; }
.launcher::before { content: ""; position: absolute; width: 160px; height: 160px;
  left: 50%; bottom: -60px; transform: translateX(-50%); border-radius: 50%;
  background: #146ef5; filter: blur(60px); opacity: 0; pointer-events: none; z-index: -1;
  transition: opacity 1s ease; }
.launcher-face { position: absolute; left: 50%; bottom: -5px; transform: translateX(-50%);
  display: flex; align-items: center; justify-content: center; width: 32px; height: 30px;
  border: 1px solid #e5e5e5; border-radius: 20px 20px 0 0; background: #fff;
  box-shadow: 2px 2px 8px #8080801a; pointer-events: none;
  transition: transform .3s ease 2s, width .4s ease 2s, border-radius .4s ease 2s; }
.launcher-mark { display: block; width: 14px; height: 14px; opacity: .8;
  transition: opacity .2s ease; }
.launcher:is(:hover, :focus-visible, [aria-expanded="true"]) .launcher-face {
  width: 41px; border-radius: 20px; transform: translate(-50%, -15px); transition-delay: 0s; }
.launcher:is(:hover, :focus-visible, [aria-expanded="true"]) .launcher-mark { opacity: 1; }
.launcher:is(:hover, :focus-visible, [aria-expanded="true"])::before { opacity: .6; }
.launcher:focus-visible .launcher-face { outline: 2px solid #146ef5; outline-offset: 3px; }
.panel { position: fixed; left: 50%; bottom: 50px; transform: translateX(-50%);
  display: flex; flex-direction: column; pointer-events: auto; container-type: inline-size;
  width: min(760px, calc(100vw - 24px)); height: min(580px, calc(100vh - 74px));
  height: min(580px, calc(100dvh - 74px)); border: 1px solid #363636;
  border-radius: 12px; background: #171717; box-shadow: 0 18px 60px #0005; overflow: hidden; }
.window-resize { position: absolute; z-index: 3; padding: 0; border: 0;
  background: transparent; touch-action: none; user-select: none; }
.window-resize:focus-visible { outline-offset: -2px !important; }
.window-resize-n, .window-resize-s { left: 16px; right: 16px; height: 7px; cursor: ns-resize; }
.window-resize-e, .window-resize-w { top: 16px; bottom: 16px; width: 7px; cursor: ew-resize; }
.window-resize-n, .window-resize-ne, .window-resize-nw { top: 0; }
.window-resize-s, .window-resize-se, .window-resize-sw { bottom: 0; }
.window-resize-e, .window-resize-ne, .window-resize-se { right: 0; }
.window-resize-w, .window-resize-nw, .window-resize-sw { left: 0; }
.window-resize-ne, .window-resize-nw, .window-resize-se, .window-resize-sw { width: 16px; height: 16px; }
.window-resize-ne, .window-resize-sw { cursor: nesw-resize; }
.window-resize-nw, .window-resize-se { cursor: nwse-resize; }
.header { padding: 12px 16px; border-bottom: 1px solid #363636; flex-shrink: 0; }
.heading, .addon-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.heading { position: relative; cursor: grab; touch-action: none; user-select: none; border-radius: 5px; }
.heading.dragging { cursor: grabbing; }
h2 { font-size: 17px; letter-spacing: -.4px; margin: 0; color: #fff; }
h3 { font-size: 11px; font-weight: 600; letter-spacing: .1em; text-transform: uppercase;
  color: #ababab; margin: 0 0 10px; }
p { margin: 8px 0; }
.muted { color: #ababab; font-size: 12px; }
.summary { color: #a8c9ff; margin: 10px 0 0; font-size: 12px; }
.actions { display: flex; gap: 4px; }
.action, .locate { border: 1px solid #4b4b4b; border-radius: 7px; background: #222;
  padding: 5px 9px; white-space: nowrap; }
.action:hover, .locate:hover { background: #363636; }
.icon-action { display: grid; place-items: center; width: 32px; height: 32px; padding: 0;
  background: transparent; border-color: transparent; color: #bcbcbc; touch-action: manipulation; }
.icon-action:hover, .icon-action[aria-expanded="true"] { color: #fff; background: #303030; }
.rescan-button { transition: color .35s ease, background-color .35s ease; }
.rescan-button.rescan-success { color: #4ade80; background-color: #173d2b; transition-duration: .18s; }
.toolbar-icon { display: block; width: 16px; height: 16px; }
.opacity-popover { position: absolute; top: calc(100% + 8px); right: 34px; width: 200px;
  z-index: 2; padding: 14px; border: 1px solid #4b4b4b; border-radius: 10px;
  background: #242424; box-shadow: 0 8px 24px #0008; cursor: default; }
.opacity-row { display: flex; justify-content: space-between; align-items: center;
  margin-bottom: 10px; font-size: 12px; }
.opacity-row output { color: #a8c9ff; font-variant-numeric: tabular-nums; }
.opacity-slider { display: block; width: 100%; margin: 0; accent-color: #146ef5; cursor: pointer; }
/* Keep native scrollbars inside the resize hit areas so both remain draggable. */
.workspace { display: flex; flex: 1; min-height: 0; padding-right: 7px; }
.sidebar { flex: 0 0 190px; min-width: 0; padding: 12px 8px; overflow-y: auto;
  overscroll-behavior: contain; border-right: 1px solid #363636; background: #1b1b1b; }
.sidebar-heading { padding: 0 8px; margin-bottom: 12px; }
.addon-link { display: block; width: 100%; padding: 10px; margin: 2px 0; text-align: left;
  border: 1px solid transparent; border-radius: 7px; background: transparent; }
.addon-link:hover { background: #282828; }
.addon-link[aria-current="true"] { background: #1c304f; border-color: #305486; }
.addon-link .name { display: block; font-size: 12px; color: #e0e0e0; }
.addon-link[aria-current="true"] .name { color: #d2e3ff; }
.addon-link-meta { display: flex; flex-wrap: wrap; gap: 3px 8px; justify-content: space-between;
  color: #ababab; font-size: 10px; margin-top: 4px; }
.issue-count { color: #ffc3aa; }
.warning-count { color: #f5cf7e; }
.content { flex: 1; min-width: 0; min-height: 0; padding: 18px; overflow-y: auto;
  overscroll-behavior: contain; }
.addon-heading { align-items: baseline; flex-wrap: wrap; gap: 6px; }
.addon-heading .name { margin: 0; color: #fff; font-size: 15px; letter-spacing: -.2px; text-transform: none; }
summary { cursor: pointer; list-style: none; display: flex; align-items: center; gap: 10px; }
summary::-webkit-details-marker { display: none; }
summary::before { content: "›"; color: #80adff; font-size: 20px; }
details[open] > summary::before { transform: rotate(90deg); }
.name { font-weight: 600; overflow-wrap: anywhere; flex: 1; min-width: 0; }
.version { color: #ababab; font-size: 11px; font-weight: 400; margin-left: 6px; }
.status { border-radius: 5px; background: #1b2d49; color: #a8c9ff; padding: 2px 6px;
  font-size: 11px; white-space: nowrap; }
.status[data-status="error"] { background: #422d28; color: #ffc3aa; }
.status[data-status="idle"], .status[data-status="unreported"],
.status[data-status="destroyed"] { background: #2b2b2b; color: #bcbcbc; }
.description { color: #d8d8d8; font-size: 12px; }
.markup-section { margin-top: 20px; }
.markup-tree, .markup-children, .markup-attributes { list-style: none; margin: 0; padding: 0; }
.markup-children { margin-left: 6px; padding-left: 16px; }
.markup-branch { position: relative; padding-bottom: 8px; min-width: 0; }
.markup-children > .markup-branch::before { content: ""; position: absolute;
  left: -12px; top: 0; bottom: 0; border-left: 1px solid #4b4b4b; }
.markup-children > .markup-branch:last-child::before { bottom: auto; height: 21px; }
.markup-children > .markup-branch::after { content: ""; position: absolute;
  left: -12px; top: 21px; width: 12px; border-top: 1px solid #4b4b4b; }
.markup-node { min-width: 0; }
.markup-heading { padding: 7px 0; font-size: 12px; gap: 7px; align-items: flex-start; border-radius: 4px; }
.markup-heading:hover, .markup-attribute-heading:hover { background: #ffffff06; }
.markup-heading::before { font-size: 16px; line-height: 20px; flex-shrink: 0; }
.markup-title { flex: 1; min-width: 0; font-weight: 600; overflow-wrap: anywhere; }
.markup-relation { display: inline; margin-left: 7px; color: #ababab; font-size: 10px; font-weight: 400; }
.markup-body { padding: 0 0 4px 17px; min-width: 0; }
.markup-selector { display: block; padding: 0 0 8px; font-size: 10px; color: #ababab; }
.markup-attribute { padding: 1px 0; }
.markup-attribute-heading { padding: 4px 0; gap: 6px; flex-wrap: wrap; font-size: 10px; border-radius: 4px; }
.markup-attribute-heading::before { font-size: 13px; line-height: 17px; flex-shrink: 0; }
.markup-attribute-name { font-size: 11px; color: #d2e3ff; flex: 1; min-width: 100px; }
.markup-required { color: #ababab; font-size: 10px; }
.markup-attribute-help { padding: 2px 0 8px 12px; }
.markup-attribute-help .locate { margin-top: 7px; }
.markup-attribute p { margin: 5px 0 0; font-size: 11px; }
.markup-attribute-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 5px 8px;
  margin-top: 5px; font-size: 10px; color: #ababab; }
.markup-result { display: inline-block; flex-shrink: 0; border-radius: 4px; padding: 1px 5px;
  font-size: 10px; font-weight: 400; color: #bcbcbc; background: #2b2b2b; }
.markup-result[data-state="present"] { color: #9fe0ba; background: #20362a; }
.markup-result[data-state="error"] { color: #ffceba; background: #422d28; }
.markup-values { color: #ababab; overflow-wrap: anywhere; }
.markup-problem { color: #ffceba; font-size: 11px; overflow-wrap: anywhere; }
.markup-problem .locate { display: block; margin-top: 5px; }
.setup-guide { margin-top: 12px; border-top: 1px solid #363636; padding-top: 7px; }
.setup-steps { margin: 0 0 12px; padding-left: 20px; color: #d8d8d8; font-size: 12px; }
.setup-steps li + li { margin-top: 6px; }
.setup-markup { white-space: pre-wrap; overflow-wrap: anywhere; background: #141414;
  padding: 10px; border-radius: 6px; margin: 8px 0; }
.attribute { padding: 10px 0; border-top: 1px solid #2b2b2b; }
code { font: 11px/1.5 ui-monospace, SFMono-Regular, Consolas, monospace;
  color: #f0f0f0; overflow-wrap: anywhere; }
.attribute-meta { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-top: 5px; }
.locate { font-size: 11px; padding: 2px 7px; }
.issue { padding: 9px 11px; margin-top: 8px; border-radius: 7px; font-size: 12px;
  background: #382821; color: #ffceba; overflow-wrap: anywhere; }
.issue[data-severity="info"] { background: #1b2940; color: #c8d9f2; }
.issue[data-severity="warning"] { background: #352d1e; color: #f5cf7e; }
.script-warnings { border-bottom: 1px solid #363636; margin-bottom: 16px; padding-bottom: 16px; }
.script-url { display: block; margin-top: 8px; }
.script-locations { font-size: 11px; margin: 6px 0 0; }
.issue .locate { margin-top: 7px; display: block; }
.unclaimed { position: relative; flex-shrink: 0; border-top: 1px solid #363636; }
.unclaimed > summary { padding: 10px 16px; font-size: 12px; }
.unclaimed-resize { display: none; position: absolute; top: -10px; left: 0; right: 0;
  height: 20px; z-index: 1; cursor: row-resize; touch-action: none; user-select: none; }
.unclaimed[open] > .unclaimed-resize { display: grid; place-items: center; }
.unclaimed-resize::before { content: ""; width: 32px; height: 3px; border-radius: 3px;
  background: #737373; box-shadow: 0 0 0 3px #171717; }
.unclaimed-resize:is(:hover, :focus-visible, .resizing)::before { background: #80adff; }
.unclaimed-resize:focus-visible { outline-offset: -4px; }
.hook-count { padding: 0 6px; border-radius: 4px; background: #2d2d2d; color: #ababab; font-size: 11px; }
.unclaimed-content { max-height: min(180px, 28vh, var(--drawer-limit, 100vh));
  max-height: min(180px, 28dvh, var(--drawer-limit, 100dvh));
  padding: 0 16px 12px; margin-right: 7px; overflow-y: auto; overscroll-behavior: contain; }
.unclaimed-content.resized { max-height: var(--drawer-limit); }
.empty { border: 1px dashed #4b4b4b; border-radius: 8px; padding: 14px; color: #bcbcbc; }
.highlight { position: fixed; pointer-events: none; border: 2px solid #146ef5;
  outline: 2px solid #fff; background: #146ef514; border-radius: 3px; }
@media (hover: none), (pointer: coarse) {
  .launcher { bottom: env(safe-area-inset-bottom, 0px); }
  .launcher-face { width: 41px; border-radius: 20px; transform: translate(-50%, -15px); }
  .panel { bottom: calc(50px + env(safe-area-inset-bottom, 0px));
    height: min(580px, calc(100vh - 74px - env(safe-area-inset-bottom, 0px)));
    height: min(580px, calc(100dvh - 74px - env(safe-area-inset-bottom, 0px))); }
  .icon-action { width: 40px; height: 40px; }
  .window-resize-n, .window-resize-s { height: 10px; }
  .window-resize-e, .window-resize-w { width: 10px; }
  .workspace { padding-right: 10px; }
  .unclaimed-content { margin-right: 10px; }
}
@container (max-width: 520px) {
  .sidebar { flex-basis: 118px; padding: 10px 5px; }
  .addon-link { padding: 8px; }
  .content { padding: 14px 12px; }
  .header { padding: 10px 12px; }
  .markup-children { margin-left: 0; padding-left: 10px; }
  .markup-children > .markup-branch::before, .markup-children > .markup-branch::after { left: -7px; }
  .markup-children > .markup-branch::after { width: 7px; }
  .markup-heading { flex-wrap: wrap; padding: 6px 0; }
  .markup-heading > .markup-result { margin-left: 16px; }
  .markup-body { padding-left: 7px; }
  .markup-relation { display: block; margin-left: 0; }
}
.runtime-section { margin-top: 22px; }
.runtime-instance { border-top: 1px solid #333; padding: 10px 0; }
.runtime-instance > summary { cursor: pointer; font-weight: 600; }
.runtime-dependencies { margin: 10px 0; padding-left: 18px; overflow-wrap: anywhere; }
@media (max-width: 520px) {
  .sidebar { flex-basis: 118px; padding: 10px 5px; }
  .addon-link { padding: 8px; }
  .content { padding: 14px 12px; }
  .header { padding: 10px 12px; }
}
@media (max-height: 480px) {
  .header { padding-top: 6px; padding-bottom: 8px; }
}
@media (prefers-reduced-motion: reduce) {
  .launcher-face, .launcher-mark, .launcher::before,
  .rescan-button, .rescan-button.rescan-success { transition: none; }
}
@media print { :host { display: none !important; } }
`;
