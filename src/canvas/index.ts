/**
 * Canvas module barrel.
 *
 * The layered rendering surface. All layers share **one** Camera transform (see
 * transform.ts) so they stay pixel-registered:
 *
 *  - {@link PageLayer} (Layer 1, task 13.1): windowed PDF page bitmaps with
 *    placeholders and off-screen release.
 *  - {@link ItemLayer} (Layer 2, task 13.1): DOM Notes (contenteditable),
 *    Image_Items, and Crop canvases.
 *  - {@link OverlayLayer} (Layer 3, task 13.2): one `<canvas>` of vector chrome
 *    — Focus_Area outlines/labels, Connectors, selection/resize handles — with
 *    Present_Mode visibility rules.
 *  - {@link InkLayer} (Layer 4, task 13.2): an independent `<canvas>` that
 *    renders Ink_Strokes and the hover cursor without ever re-rendering Pages.
 *  - {@link CaptureSurface} (Layer 5, task 13.2): the transparent
 *    `touch-action:none` element the Input_Router attaches to (wired in 15.1).
 *
 * The shared transform helpers and the Crop sub-region render path are exported
 * too so the app shell (task 15.1) and tests can reuse them. Import from
 * `../canvas` (or `@/canvas`) rather than the individual files.
 */

export { PageLayer, PAGE_WINDOW_MARGIN_PX } from './PageLayer';
export type { PageLayerProps } from './PageLayer';

export { ItemLayer } from './ItemLayer';
export type { ItemLayerProps } from './ItemLayer';

export { OverlayLayer, drawOverlay, HANDLE_SCREEN_PX } from './OverlayLayer';
export type { OverlayLayerProps, OverlayDocument } from './OverlayLayer';

export { InkLayer, drawInk } from './InkLayer';
export type { InkLayerProps, HoverCursor } from './InkLayer';

export { CaptureSurface } from './CaptureSurface';
export type { CaptureSurfaceProps } from './CaptureSurface';

export { cameraTransform, visibleCanvasRect, visiblePageIndices } from './transform';

export { renderCrop } from './cropRender';
export type { RenderedCrop } from './cropRender';
