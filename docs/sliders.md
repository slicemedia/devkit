# Attribute-based Webflow sliders

Prefer Swiper for new slider behavior while honoring an explicit choice of native Webflow sliders
or another implementation. Keep markup, CMS bindings, and visual styling in Webflow. For the
optional Slice Media Swiper Adapter, prefer its reversible attribute structure mode when the
installed version supports it.

## Compatibility

`structure` requires **Swiper Adapter 0.2.0 or later**. DevKit 0.5.1 creates slider projects with
the compatible `^0.2.0` adapter range and Agent Kit `^0.2.4` when agent instructions are selected.
Projects created with DevKit 0.5.0 used `^0.1.0`, which does not include 0.2.0; upgrade that
dependency explicitly before adopting the new mode. The generated `createProjectSlider()`
integration forwards adapter options, so this needs no second adapter or additional vendor bundle.
Existing standard-markup sliders remain compatible without the mode.

```sh
pnpm add @slicemedia/swiper-adapter@next
```

Keep the existing compatible Swiper peer dependency, regenerate installed Agent Kit instructions
after updating that package, and rebuild the shared vendor together with affected addons.

## Markup and design

```html
<section class="cards-component" data-wft-slider>
  <div class="cards-cms">
    <div class="cards-grid" data-wft-slider-track role="list">
      <article class="card" data-wft-slider-slide data-wft-slide-key="one" role="listitem">
        First card
      </article>
      <article class="card" data-wft-slider-slide data-wft-slide-key="two" role="listitem">
        Second card
      </article>
    </div>
  </div>
</section>
```

Map the CMS Collection List to the track, Collection Items to slides, and the existing Collection
List Wrapper to the Swiper container. The track must be the container's direct child and slides
must be direct children of the track. Put only slide content in the track. The adapter can also
use all direct items when no slide attributes are present, excluding scripts/styles/templates.
Use persistent CMS identifiers for slide keys, never the current array index.

Style `cards-grid`, `card`, and other component classes in Webflow. They can form a normal grid on
desktop. No permanent `.swiper`, `.swiper-wrapper`, or `.swiper-slide` classes are required in the
Designer. The adapter adds those technical classes and flex mechanics only while enabled, clears
track gaps for Swiper's `spaceBetween`, and restores authored attributes and layout when disabled.
Official Swiper CSS still belongs in the shared vendor. Card widths for `slidesPerView: "auto"`
remain project-owned.

New slider vendors import `src/vendors/slider.css`, which loads the official CSS in a lower-priority
cascade layer:

```css
@import "swiper/css" layer(swiper);
```

This lets Webflow's unlayered component classes keep their display and widths even when the vendor
loads later. If project CSS uses layers too, declare the `swiper` layer below the design layers.
Existing projects can replace the vendor's direct `import "swiper/css"` with an import of this
local stylesheet; no adapter upgrade is required for the CSS layer alone. Add official module CSS
imports to the same layer only when the project uses them.

## Addon integration

Call the generated integration from an addon lifecycle after finding the root, optionally when it
approaches the viewport:

```ts
const slider = await createProjectSlider({
  target: root,
  structure: true,
  enabled: { maxWidth: 767 },
  observeMutations: true,
  swiper: { slidesPerView: 1.2, spaceBetween: 16 },
});
slider?.on("structureIssue", ({ element, reason, message }) => {
  console.warn(reason, message, element);
});
slider?.init();
// In the addon's teardown: slider?.destroy();
```

Import `createProjectSlider` from the project's `src/integrations/slider.ts`; do not add a runtime
adapter import to each addon. Keep pending async initialization owned by the addon so teardown
also handles a vendor load that finishes later. The existing loader shares `vendor/slider.js` and
`vendor/slider.css` across independent addon files.

For different neutral hooks, use scoped `structure.track`, `structure.slides`, and
`structure.container` selectors. The optional container selector must resolve to the track's
direct parent inside the root. `equalHeight` and `containInlineSize` are opt-in layout helpers;
`layout: false` leaves mechanical layout to project CSS. The adapter does not rebuild arbitrary
nested markup or clone author content. Do not combine this mode with upstream `createElements`,
virtual slides, or renamed wrapper/slide classes.

Keep optional navigation and pagination inside the component root, outside the track; they may
sit beside the CMS wrapper. Use native named buttons with `type="button"`. Expose the optional
`createWebflowSwiperOptions()` helper from the shared slider vendor and update the integration's
declared exports together if needed. Pass it the component root, not the inner CMS container.
Include only the official module CSS used by that project. Nested components own their controls.

## Verify and deploy

Test the original grid without JavaScript, multiple roots, breakpoint disable/re-enable, hidden
containers, CMS insertions and complete track replacement, keyboard navigation, reduced motion,
and destroy/reinitialize. `structureIssue` reports missing, empty, or incompatible markup.
Mutation observation retries child changes; attribute-only contract changes need `refresh()`.
The root and actual container must both be measurable. Inspect real behavior after initialization;
successful setup alone does not prove layout or accessibility is correct.

Rebuild the related addons and shared vendor after changing the adapter dependency. Deploy the
complete `dist/` tree, retaining nested addon folders and `vendor/`. See
[shared dependencies](shared-dependencies.md), [deployment](deployment.md), and the
[adapter API](https://github.com/slicemedia/swiper-adapter#structure-options).
