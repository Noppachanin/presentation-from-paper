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

The specification is complete; implementation follows the task plan in [`tasks.md`](.kiro/specs/pdf-presentation-canvas/tasks.md). A standalone proof-of-concept, [`pointer-events-demo.html`](pointer-events-demo.html), validates that the Pointer Events API distinguishes Apple Pencil, finger, and mouse input in Safari - open it directly in a browser to try it.

## Getting started

> These commands describe the intended workflow once the Vite app is scaffolded per task 1 of the plan.

```bash
# install dependencies
npm install

# start the dev server
npm run dev

# run all tests once (no watch): Vitest + Playwright WebKit
npm run test:ci

# production build (static files)
npm run build
```

## Saving and loading a presentation

1. Open a PDF from your computer (file picker or drag-and-drop). Nothing is uploaded.
2. Build your presentation: draw focus areas, add notes/images/crops, connect them, and order the steps.
3. **Save** to download a `.json` presentation file. The PDF itself is not included - only a fingerprint (PDF.js fingerprint, page count, title), plus embedded images and crop source regions.
4. **Load** the `.json` later and re-select the same PDF. The app compares fingerprints and warns on a mismatch, offering to continue or pick a different file.

## Deployment (GitHub Pages)

The app builds to static files and is published by a GitHub Actions workflow on push to the default branch:

- `vite.config.ts` reads the `base` path from a build configuration value so the app works under a GitHub Pages project subpath.
- The PDF.js worker is bundled with the build and served from the same origin (no third-party host).
- All processing runs in the browser; there is no backend.
- If the build step fails, the workflow stops and the previously published version stays in place.

## Safari / Apple Pencil manual check

Automated tests cannot reproduce Apple Pencil hardware, so verify these by hand on an iPad in Safari: pressure-sensitive stroke width, palm rejection (finger ignored while the pen is down), Pencil hover where supported, the eraser, drawing in present mode without triggering step navigation, the full-screen fallback, installing to the Home Screen, and drawing latency.

---

Built with [Kiro](https://kiro.dev).
