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
  request. Regenerate it after changing a source stylesheet.
- `integration.js`: one shared optional WebGL planet across two passages.
  One scroll-derived angle drives both its rotation and each original content
  row's emergence. Text remains normal HTML with its original UI behavior.
- `orbit-motion.js`: reversible angular phases, surface origins and curved
  poses shared by the renderer, typography and repeatable motion checks.
- `planet.js`: the lightweight analytic sphere, existing marble texture and
  material-anchored logo engraving with recessed, light-catching bevels.
- `brand.css` and `assets/brand/`: the supplied Pathos IoT identity, rebuilt
  as crisp vectors for navigation, footer, icons and social previews.
- `prototype-loader.js`: prepares the original in-page hardware study one
  viewport ahead. Playback uses the original 2 MB model and full texture
  sources on every device, at Full HD or native density when sharper. It downloads no
  pre-rendered frame sequence by default.
- `hardware-quality.js`: gives the actual Blender picture a 1920 × 1080
  minimum, measured inside its letterboxed view, while retaining sharper native
  density. Extreme drawing buffers remain bounded to 8 Mi pixels and the GPU's
  dimension limit. Slow frames never reduce resolution. Antialiasing stays
  enabled for fine wires and pin rows, with up to 16× anisotropic filtering
  on the laptop's oblique display textures.
  Large drawing buffers are released when hidden or offscreen and restored
  before the study returns; the model stays ready without another download.
- `hero.js` and `film.js`: preserve the real films, with deferred loading,
  visibility pauses, controls, and reduced-motion alternatives.
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

The engraving adds a 7.5 KB optional packed relief map. It loads independently
of the sphere, follows its scroll-driven rotation and triggers one redraw.
Missing WebGL retains an etched-logo CSS fallback. Branding changes preserve
original media, technical model identifiers and the archived content baseline.

To rebuild the brand assets, install `@resvg/resvg-js` outside this site in
`../brand-tools`, then run `node deliverables/build-brand.cjs`. This development
dependency is not shipped to visitors. Rebuild the integrated page with
`node deliverables/build-integrated.cjs` and auxiliary page branding with
`node deliverables/apply-brand.cjs`.

## Rebuild and verify

```sh
node deliverables/build-integrated.cjs
node deliverables/verify-integrated.cjs
node deliverables/verify-orbit-motion.cjs
node deliverables/verify-brand.cjs
node deliverables/verify-hardware.cjs
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

With Playwright available to Node, `node deliverables/verify-hardware-browser.cjs`
checks real native-resolution rendering, chapter seeking, 360 and zoom, idle
rendering, offscreen buffer release and full-resolution return at desktop 2×
and mobile 3× pixel density. It saves screenshots in the OS temporary folder
unless `PATHOS_QA_OUTPUT` is set. These emulate layouts on the test computer;
they do not measure every phone or GPU.

`deliverables/verify-experience.cjs` belongs to the preserved standalone
edition; use the integrated audit on this branch.

## Research status

The working MVP 1 uses the ESP32 and BME280 environmental pipeline. Body
sensors, a wearable format, and caregiver alerts are MVP 2 development work.
WESAD research is not validated accuracy on Pathos IoT hardware. The site
measures no visitor physiological signals. Pathos IoT is not a medical device.
