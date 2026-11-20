# Pathos IoT

The founder's complete original landing page, with its 19 sections and
interactive experiences retained. The new planetary narrative applies only
to the twelve text sections selected in the reference screenshots.

The standalone planetary redesign is preserved on `main` in
[Rsign1279/Pathos-landing-2](https://github.com/Rsign1279/Pathos-landing-2),
at commit `df2831c`. Its production deployment is
[pathos-landing-2.vercel.app](https://pathos-landing-2.vercel.app/).
The editable integrated edition is on `main` in
[Rsign1279/PathosIot](https://github.com/Rsign1279/PathosIot).

Live website: [pathosiot.vercel.app](https://pathosiot.vercel.app/).
Vercel is connected to `PathosIot/main`; pushing edits to that branch deploys
the site automatically. It is a static site with no install or build command.
`site.config.json` sets the canonical origin used by the page generators.

## Run

Clone the source, then serve the checked-in page. No installation or build
is needed:

```sh
git clone https://github.com/Rsign1279/PathosIot.git
cd PathosIot
python -m http.server 3000 --bind 127.0.0.1
```

Open http://localhost:3000/.

## Preserved original work

The marble-film hero, four proof results, project film, four-screen software
tour, ten-chapter hardware study and 360 view, six-photo deck, contact form,
and full footer remain in the page. They are outside the planet passages.

Inside the passages, all original content and interactions remain:

- Six partners, including roles, named mentors, coverage, and the press image.
- The problem chart and its three arguments.
- Four feature demonstrations and four selectable signal traces.
- Four model steps and the WESAD limitation.
- All six parts/controller rows, bus details, and component statuses.
- MVP 2 plans, seven roadmap milestones, and five workshops.
- The interactive place/verify/observe tutorial.
- The founder's biography, role, photo, five credentials, and LinkedIn.
- All four original FAQ questions and answers.

`deliverables/original-page.html` retains the exact original markup from
commit `6cfb566` so content preservation is directly auditable.

## Implementation

- `integration.css`: the new typography, palette, scoped planet layouts,
  responsive reading layout, and shared visual refinements.
- `integrated.css`: the existing styles plus the integration layer in one
  request. Regenerate it after changing a source stylesheet. The build converts
  legacy pixel type sizes to `rem`; drawing dimensions stay in pixels.
- `design-tokens.css` and `ui-system.css`: shared colors, scalable type,
  spacing, focus, touch targets, button states, and motion. Active layout
  boundaries are 640px, 900px and 1100px. Component-specific picture fitting
  remains separate from navigation behavior.
- `compact-layout.css`: the original scroll-driven photo deck retains all six photographs;
  the software tour keeps its restored pinned scroll track and four screens.
- `integration.js`: one shared optional WebGL planet across two passages.
  One scroll-derived angle drives both its rotation and each original content
  row's emergence. Text remains normal HTML with its original UI behavior.
- `orbit-motion.js`: reversible angular phases, surface origins and curved
  poses shared by the renderer, typography and repeatable motion checks.
- `planet.js`: the lightweight analytic sphere, existing marble texture and
  material-anchored logo engraving with recessed, light-catching bevels.
- `brand.css` and `assets/brand/`: the supplied Pathos IoT identity, rebuilt
  as crisp vectors for navigation, footer, icons and social previews.
- `prototype-loader.js`: prepares the guide two viewports ahead, without an
  unconditional page-load import. Guided is the first mode.
- `hardware-guided-film.js` and `assets/hardware/rig-1080p60.mp4`: the original
  scene rendered natively at 1920 × 1080, 60fps, with all 2,880 film frames.
  Standard BT.709 colour and two-frame keyframe intervals keep playback
  compatible and forward/reverse seeking responsive. The browser paints and
  decodes the movie directly. One seek runs at a time;
  newer scroll positions replace the queued target. Shot labels follow the
  decoded frame. The old 720p images are an explicit media-error fallback only.
  Native playback, offscreen suspension and short keyframe intervals avoid
  image-cache stalls and blended/doubled geometry.
- `hardware-adaptive.js`: conservative, browser-local playback policy. Hardware
  hints can veto a probe; only a benchmark of the actual full-resolution scene
  can enable automatic 3D. Software rendering, reduced motion, coarse pointers,
  saving data, and uncertain performance keep Guided. No analytics are sent.
  Scroll motion uses a time-based critically damped response; reduced motion
  selects the requested pose directly.
- `hardware-experience.js` and `.css`: original pinned Blender hardware presentation,
  Guided Visual / 3D Walkthrough tabs, optional playback, and ten chapter
  controls. Original shot titles and the chapter rail remain inside the tall
  film viewport; scrolling follows the original animation in either direction. Manual input wins
  over pending automatic decisions. Sustained lag or graphics loss returns to
  Guided at the same film position. Stale requests and a 45-second loading
  timeout cannot reactivate 3D. Both the landing and standalone hardware page
  use the same generated section.
- `hardware-quality.js`: gives the actual Blender picture a 1920 × 1080
  minimum, measured inside its letterboxed view, while retaining sharper native
  density. Extreme drawing buffers remain bounded to 8 Mi pixels and the GPU's
  dimension limit. Slow frames never reduce resolution. Antialiasing stays
  enabled for fine wires and pin rows, with up to 16× anisotropic filtering
  on the laptop's oblique display textures.
  Large drawing buffers are released when hidden or offscreen and restored
  before the study returns; the model stays ready without another download.
- `hero.js`, `film.js` and `media-controls.css`: preserve the real films, with
  deferred loading, visible background-film pause, one set of native project-film
  controls, visibility pauses, and reduced-motion alternatives.
- `assets/pathos-hardware-poster.webp`: a native 1920 × 1080 lossless render
  of the original film's first frame. It switches directly to the ready 3D
  image without a crossfade that could ghost moving parts. Rebuild it with
  `node deliverables/build-hardware-poster.cjs` when Playwright and Python
  with Pillow are available in the development environment.

Original headings travel across the marble surface, then unroll into their
reserved reading positions. Paired entries share a row trajectory; later
rows clear previously delivered copy. The sphere and text stop together
when scrolling stops, and rewind together when scrolling reverses. Rendering
stops at rest and outside the passages. No animation framework was added.

On phones a larger, compact planet emits down from its lower edge into the
full-width page. Pause and reduced-motion preference expose every word
immediately. Keyboard focus settles interactive content. No nested scroll
container or forced snapping is used. Fonts are served locally.

The engraving uses the supplied emblem, enlarged for mobile, with a recessed
bevel and a muted yellow mineral finish that shares the stone's light and grain.
Its 5.5 KiB optional packed relief map loads independently of the sphere, follows
its scroll-driven rotation and triggers one redraw. The emblem naturally turns
out of view on the far side. Missing WebGL retains a warm etched-logo CSS fallback.
Branding changes preserve original media, technical model identifiers and the
archived content baseline.

To rebuild the brand assets, install `@resvg/resvg-js` outside this site in
`../brand-tools`, and install Python `fonttools[woff]`. Then run
`node deliverables/build-brand.cjs`. The social image outlines the same local
EB Garamond and Figtree fonts used by the site, rather than relying on host
fonts. These development dependencies are not shipped to visitors. Rebuild the integrated page with
`node deliverables/build-integrated.cjs` and auxiliary page branding with
`node deliverables/apply-brand.cjs`.

## Rebuild and verify

```sh
node deliverables/build-integrated.cjs
node deliverables/verify-integrated.cjs
node deliverables/verify-orbit-motion.cjs
node deliverables/verify-brand.cjs
node deliverables/verify-hardware.cjs
node deliverables/verify-hardware-adaptive.cjs
node deliverables/verify-scroll-restoration.cjs
node deliverables/verify-field-scroll.cjs
node deliverables/verify-hardware-film.cjs
node deliverables/verify-guided-motion.cjs
```

The audit compares every original section's text and content collections,
validates assets/anchors, checks the planet's scope and original interaction
contracts, and checks JavaScript syntax. Browser QA separately verifies
desktop/mobile rendering, navigation, signals, media, hardware, photos,
FAQ, tutorial controls, and contact validation. QA never sends real emails.

The motion suite loads the actual production math and controller in a small
fake-document harness. It checks forward/reverse phases, paired row spacing,
surface typography, idle scheduling, pause, reduced motion, focus, keyboard
signals, resize coalescing, deep jumps and the shared renderer fallback.

With Playwright available, `node deliverables/verify-planet-browser.cjs` checks
the real engraving shader's pixels, reversible rotation, foreshortening and
far-side occlusion, then exercises both passages and graphics context recovery
at desktop and mobile widths. Serve the page on port 3000 first, or set
`PATHOS_QA_URL`; `PATHOS_CHROMIUM_PATH` optionally selects a browser executable.

With Playwright available, `node deliverables/verify-design-browser.cjs` checks
phone, landscape, tablet, desktop, zoom layout, 200% text, reduced motion,
touch targets, focus and sampled video contrast. `node deliverables/verify-hardware-browser.cjs`
checks guided defaults, no-WebGL and failed-frame fallbacks, chapters, seek,
playback, truthful tabs and async loading failures. Use `HW_QA_3D=1` for the
slower native-model/orbit/context-loss checks. Screenshots go to the temporary
folder unless `PATHOS_QA_OUTPUT` is set. Browser software rendering checks
correctness; actual mid-range phone and physical GPU performance still need
real-device measurement.

`deliverables/verify-experience.cjs` belongs to the preserved standalone
edition; use the integrated audit on this branch.

## Research status

The working MVP 1 uses the ESP32 and BME280 environmental pipeline. Body
sensors, a wearable format, and caregiver alerts are MVP 2 development work.
WESAD research is not validated accuracy on Pathos IoT hardware. The site
measures no visitor physiological signals. Pathos IoT is not a medical device.
