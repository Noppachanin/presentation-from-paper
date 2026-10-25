# pwa/

PWA / Home_Screen_Mode integration (task 16.1). Covers the Supported_Safari and
Home_Screen_Mode concerns from the design: manifest + meta tags, safe-area
layout, visual-viewport sizing, and the Fullscreen_Fallback hint.

## Files

- `useVisualViewport.ts` — `useVisualViewport()` hook and the pure
  `readVisualViewportSize()` helper. Returns the current **visible** viewport
  size, preferring `window.visualViewport` and falling back to
  `window.innerWidth/innerHeight`. Subscribes to `visualViewport`
  `resize`/`scroll` so the Canvas re-sizes as the Safari toolbar/address bar
  collapse (Req 15.8). The App uses this to size the Canvas surface while in
  Present_Mode.
- `standalone.ts` — `isStandalone()` detects Home_Screen_Mode via two signals:
  the standard `matchMedia('(display-mode: standalone)')` and the legacy Apple
  `navigator.standalone` flag. Used to suppress the install hint once the app is
  already installed (Req 8.13).
- `HomeScreenHint.tsx` — the dismissible "add to Home Screen for a full-screen
  presentation" hint shown as the Fullscreen_Fallback when the Fullscreen API is
  unavailable or the request is rejected (Req 8.13). Renders nothing when
  already standalone.
- `pwa.css` — minimal global styles: full-viewport `.app` using `100dvh`
  (Req 15.8) and the `.app-toolbar-safe-area` top-chrome safe-area padding
  (Req 15.7). The InkPalette/StepIndicator already apply `env(safe-area-inset-*)`
  from task 14.2.
- `index.ts` — barrel.

## Static assets (not in this folder)

- `index.html` (repo root) — the viewport meta with `viewport-fit=cover`
  (Req 15.7), the legacy Apple meta tags + `theme-color` (Req 15.6), the
  `apple-touch-icon`, the favicon, and the `<link rel="manifest">`. Icon/manifest
  hrefs use Vite's `%BASE_URL%` so they are correct under a GitHub Pages project
  subpath.
- `public/manifest.webmanifest` — the Web App Manifest with `display:
  "standalone"`, name/short_name, `start_url`/`scope` as `./` (relative so it
  resolves against the manifest URL under any base), theme/background colors,
  `orientation: "any"`, and icon entries (Req 15.6). Served verbatim by Vite from
  `public/`; `%BASE_URL%` in the `<link>` applies the base path, and the
  manifest's own relative paths resolve from there.
- `public/icon.svg` — the app icon, used for the manifest icons, the Apple touch
  icon, and the favicon.

## Base-path note

Icon and manifest references in `index.html` use `%BASE_URL%` so they respect
the Vite `base` subpath (Req 10.2). Paths **inside** the manifest are relative
(`./icon.svg`, `./`) so they resolve against the served manifest URL regardless
of the base.

## PNG apple-touch-icon caveat

iOS/iPadOS historically prefers a raster PNG for `apple-touch-icon`
(180×180). The SVG `public/icon.svg` is referenced for now because a binary PNG
cannot be authored with the text tooling used here. A `public/apple-touch-icon.png`
(180×180) should be added later and the `<link rel="apple-touch-icon">` href
pointed at it; the SVG remains a working fallback in the meantime.
