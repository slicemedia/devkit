---
"@slicemedia/devkit-core": minor
"@slicemedia/devkit": minor
---

Add the optional `@slicemedia/devtools` package with an explicitly mounted on-page inspector, addon and attribute
inventories, scoped markup checks, read-only element highlighting, and a bottom-center Webflow
launcher that rises on hover and tucks away after two seconds. The draggable panel includes
an opacity control, Lucide toolbar icons, independent addon navigation and detail scrolling,
and a collapsible, resizable unclaimed-attribute inventory. Existing root imports and generated project
behavior are unchanged.

Warn about repeated addon registrations with matching or overlapping scopes and repeated external
script URLs, while allowing independent component instances and reporting include evidence without
claiming that scripts executed twice.

Resize the window from all edges and corners and remember its dimensions and opacity after explicit
interaction. Initialize automatically on Webflow staging domains, with a persistent
`window.DevKitDevTools.enabled` flag for other origins. Dormant production startup only registers
the console API and reads existing preferences: no inspector UI, scans, listeners, timers, or
storage writes. Allow lazy registration sources and discover inspectable runtime APIs on each scan
so a standalone inspector does not depend on addon script order.
