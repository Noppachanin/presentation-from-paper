/**
 * PWA integration barrel (task 16.1).
 *
 * Home_Screen_Mode / Safari integration helpers:
 *  - `useVisualViewport` / `readVisualViewportSize` — size the Canvas to the
 *    visible viewport under the collapsing Safari toolbar (Req 15.8).
 *  - `isStandalone` — detect Home_Screen_Mode to suppress the install hint.
 *  - `HomeScreenHint` — the Fullscreen_Fallback add-to-Home-Screen hint (Req 8.13).
 *
 * The manifest, meta tags, Apple touch icon, and safe-area CSS live in
 * `index.html`, `public/`, and `src/pwa/pwa.css` respectively; they are static
 * assets rather than exported modules.
 *
 * Import from `../pwa` rather than the individual files so the module layout
 * can change without touching call sites.
 */

export { useVisualViewport, readVisualViewportSize } from './useVisualViewport';
export type { ViewportSize } from './useVisualViewport';

export { isStandalone } from './standalone';

export { HomeScreenHint } from './HomeScreenHint';
export type { HomeScreenHintProps } from './HomeScreenHint';
