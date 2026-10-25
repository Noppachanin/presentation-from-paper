# PDF Presentation Canvas

Turn a scientific paper (PDF) into an interactive, Prezi/Miro-style presentation that runs entirely in the browser.

The app shows the paper like a simple PDF reader on an infinite pan/zoom canvas, then lets you mark rectangular focus areas, add white-space content (notes, images, and enlarged crops of the paper), connect that content to the parts of the paper it relates to, and order everything into a sequence of steps. Playing the sequence animates the camera smoothly between the paper and the white space. On an iPad in Safari you can annotate live with an Apple Pencil while you move around the canvas with your fingers.

Everything runs locally. The PDF is never uploaded, embedded, or hosted. A presentation is saved as a JSON file that stores a fingerprint of the PDF; when you load it again you re-open the same PDF from your computer.

---

<p align="center">
  <a href="https://kiro.dev">
    <img src="https://kiro.dev/apple-icon.png" alt="Kiro" width="72" height="72" />
  </a>
</p>

<p align="center"><b>Built with <a href="https://kiro.dev">Kiro</a></b></p>

This project was planned and specified with **Kiro**, an agentic AI development environment. Kiro turns a plain-language prompt into structured **requirements**, an **architectural design**, and a **sequenced task plan**, then implements and verifies the work with its agents (including property-based tests that target edge cases). The full spec for this app lives in [`.kiro/specs/pdf-presentation-canvas/`](.kiro/specs/pdf-presentation-canvas/):

- [`requirements.md`](.kiro/specs/pdf-presentation-canvas/requirements.md) - 15 requirements in EARS format with a glossary.
- [`design.md`](.kiro/specs/pdf-presentation-canvas/design.md) - architecture, coordinate systems, camera/transition model, and 29 correctness properties.
- [`tasks.md`](.kiro/specs/pdf-presentation-canvas/tasks.md) - the incremental, test-driven implementation plan.

Learn more about the tool at [kiro.dev](https://kiro.dev).

---

## Features

- **PDF reader on an infinite canvas** - pages laid out in a column with free pan and zoom (zoom range 0.05x-8x), "fit page width", and a toolbar showing the current zoom and page.
- **Focus areas** - draw a rectangle on a page to mark a region the camera will zoom to; each one becomes a step.
- **White-space content** - add text notes, pasted/uploaded images, and enlarged crops of a paper region placed next to the pages.
- **Connectors** - link white-space content to the focus area or page region it explains; crops auto-connect to their source.
- **Step sequence** - order steps in a side panel with thumbnails, drag-to-reorder, and speaker notes.
- **Smooth transitions** - Prezi/Miro-style ease-in-out camera moves with a zoom-out/zoom-in arc for distant jumps; honors reduced-motion.
- **Edit and present modes** - build in edit mode; present full-screen with keyboard, click, tap, and swipe navigation.
- **Apple Pencil ink (Safari on iPad/Mac)** - draw, erase, and optionally keep pressure-sensitive handwritten annotations during a presentation. Pen draws, fingers pan/zoom, with palm rejection.
- **Save / load** - export a JSON presentation file (images embedded, crops re-rendered from the PDF on load) with a PDF fingerprint check and mismatch warnings.
- **Undo / redo** - at least 50 editing actions, including ink; camera moves are excluded.
- **Static web app** - deploys to GitHub Pages; no backend, no third-party scripts, PDF.js worker bundled same-origin.

## Tech stack

React 18, Vite 5, TypeScript 5, PDF.js (modern build), Zustand + Immer for state, Vitest + fast-check for unit/property tests, and Playwright (WebKit) for end-to-end tests. Target baseline: Safari 16.4+ in addition to desktop Chromium and Firefox.

## Project status

The app is built and deployable; development follows the task plan in [`tasks.md`](.kiro/specs/pdf-presentation-canvas/tasks.md). A standalone proof-of-concept, [`pointer-events-demo.html`](pointer-events-demo.html), validates that the Pointer Events API distinguishes Apple Pencil, finger, and mouse input in Safari - open it directly in a browser to try it. (The demo is a local spike and is gitignored.)

## Getting started

Requires Node 18 or newer (the deployment workflow uses Node 20).

```bash
# install dependencies
npm install

# start the Vite dev server (http://localhost:5173)
npm run dev

# run all tests once (no watch): Vitest + Playwright WebKit
npm run test:ci

# production build -> dist/ (runs tsc -b, then vite build)
npm run build

# serve the production build locally to preview it
npm run preview
```

`npm run build` type-checks with `tsc -b` and then produces the static site in `dist/`. `npm run preview` serves that `dist/` output so you can smoke-test the production bundle before deploying.

## Saving and loading a presentation

1. Open a PDF from your computer (file picker or drag-and-drop). Nothing is uploaded.
2. Build your presentation: draw focus areas, add notes/images/crops, connect them, and order the steps.
3. **Save** to download a `.json` presentation file. The PDF itself is **not embedded** - the file stores only a fingerprint of it (the PDF.js fingerprint, page count, and title) together with your focus areas, white-space content, connectors, and the ordered step sequence with speaker notes. Images you added are embedded as data URLs; crops are **not** stored as bitmaps - only their source region on the page, so they are re-rendered from the PDF when you load.
4. **Load** the `.json` later and re-select the same PDF. The app compares the stored fingerprint against the PDF you pick:
   - **Match** - the presentation is restored, crops are re-rendered from the PDF, and the saved initial camera is applied.
   - **Mismatch** (different fingerprint or page count) - you get a warning with two choices: **continue anyway** or **choose a different file**. If you continue, focus areas and crops that fall outside the new PDF's pages are clamped back into range or discarded so the presentation stays valid.

## Deployment (GitHub Pages)

The app builds to static files and is published to GitHub Pages by a GitHub Actions workflow at [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml). On every push to `main` the workflow installs dependencies, runs `npm run build`, and publishes `dist/` to Pages.

**One-time setup in the repository:**

1. Go to **Settings → Pages** and set **Source** to **GitHub Actions**.
2. Push to `main` (or re-run the workflow). The build runs with `VITE_BASE_PATH` set to the project subpath so asset URLs resolve under Pages.

For this repository the site is served at:

```
https://noppachanin.github.io/presentation-from-paper/
```

Because it is a GitHub Pages *project* site, the app is served from a subpath. The workflow sets `VITE_BASE_PATH=/presentation-from-paper/`, which `vite.config.ts` reads into Vite's `base` so scripts, styles, and the PDF.js worker all load correctly. For local dev the base defaults to `/`.

Other notes:

- The PDF.js worker is bundled with the build and served from the **same origin** - no third-party host.
- All processing runs in the browser; there is **no backend** and no PDF is ever uploaded.
- If the build step fails, the workflow stops and the **previously published version stays in place**.

### Starting directly in present mode

The deployed app accepts a Present_Mode flag in the URL query. After you load a presentation and re-select its PDF, adding `?present` (or `?mode=present`) starts the app in present mode instead of edit mode - handy for a kiosk-style or one-click playback link. An explicit `?present=false` (or `0`/`no`/`off`) keeps edit mode.

## Safari / Apple Pencil manual check

Apple Pencil behavior depends on real hardware and Safari/WebKit touch handling, so **automated tests cannot reproduce it**. The Playwright WebKit suite covers rendering and simulated pointer input, but pressure, palm rejection timing, hover, and perceived latency must be verified **by hand on a real iPad** running Safari on iPadOS with an Apple Pencil.

Run through this checklist on an iPad before relying on a presentation:

- [ ] **Pressure-sensitive stroke width** - pressing harder draws a wider stroke and lighter pressure a thinner one (width scales smoothly, roughly 25%-100% of the selected width).
- [ ] **Palm rejection** - while the pen is down, resting a palm or finger on the screen does **not** draw, pan, or zoom; finger input resumes shortly after the pen lifts.
- [ ] **Pen cancels touch** - starting a stroke with the Pencil while a finger pan/pinch is in progress stops that gesture and freezes the camera (no drift while you draw).
- [ ] **Apple Pencil hover** - on iPads that support hover, moving the Pencil just above the glass shows the ink cursor without drawing.
- [ ] **Eraser** - the eraser removes whole strokes under the pen and leaves nearby strokes intact.
- [ ] **Drawing in present mode without navigation** - while presenting, drawing with the Pencil annotates the canvas and does **not** trigger step navigation (tap/flick navigation is finger/touch only; the pen is excluded).
- [ ] **Fullscreen fallback** - requesting fullscreen enters it where WebKit supports the Fullscreen API; where it does not, the app falls back gracefully and shows the add-to-Home-Screen hint instead of breaking.
- [ ] **Add to Home Screen (Home_Screen_Mode)** - installing the site to the Home Screen launches it standalone (no Safari chrome), with the toolbar and ink palette laid out inside the safe-area insets and the canvas sized to the visible viewport.
- [ ] **Perceived latency** - handwriting feels responsive, with ink following the Pencil tip closely and no noticeable lag during a stroke.

---

Built with [Kiro](https://kiro.dev).
