# canvas/

The layered rendering surface. Every layer is positioned by **one shared
Camera transform** (`transform.ts` → `cameraTransform`), applied as a single CSS
transform on each layer's content container whose children are laid out in
canvas coordinates. This keeps all layers pixel-registered and lets the browser
composite each layer with one matrix.

## Implemented (task 13.1)

- **PageLayer** (`PageLayer.tsx`) — Layer 1. Windowed PDF.js page bitmaps: only
  pages intersecting the viewport (plus a screen-pixel margin) keep a rendered
  bitmap; off-screen pages release theirs (Req 1.7). A placeholder sized to the
  page shows while a bitmap renders (Req 1.3). On zoom change it asks the
  renderer to re-render visible pages (500 ms settle debounce lives in the
  renderer, Req 1.6). Takes the `PdfPageRenderer` (or `null`) and placements as
  props.
- **ItemLayer** (`ItemLayer.tsx`) — Layer 2 (DOM). Notes as `contenteditable`
  boxes (edits commit via `setNoteText`, Req 4.1), Image_Items as `<img>`, and
  Crops as `<canvas>` re-rendered from the PDF at a resolution matching the
  crop's display size (Req 4.4). Content only — selection/move/resize handles
  are the OverlayLayer (13.2) and input wiring is the app shell (15.1).
- **transform.ts** — pure shared transform + windowing helpers
  (`cameraTransform`, `visibleCanvasRect`, `visiblePageIndices`).
- **cropRender.ts** — `renderCrop`, a small self-contained PDF sub-region render
  path for Crops that reuses the Safari area clamp (`clampRenderScale`) without
  modifying `src/pdf`.

## Later tasks

- **OverlayLayer** and **InkLayer** — task 13.2.
