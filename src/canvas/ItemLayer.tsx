/**
 * Layer 2: the DOM ItemLayer (task 13.1).
 *
 * Renders the white-space items — Notes, Image_Items, and Crops — as DOM
 * elements positioned in **canvas coordinates** inside a single container that
 * carries the one shared Camera transform (see transform.ts), so the ItemLayer
 * stays pixel-registered with the Page/Overlay/Ink layers (Req 1.2). The layer
 * is a plain `<div>` stack (not a `<canvas>`) because Notes must be real
 * `contenteditable` DOM for text editing/IME/selection (Req 4.1) and images are
 * natural `<img>` elements.
 *
 * ## What this task renders (Req 4.1, 4.4)
 *  - **Notes** as `contenteditable` boxes sized/positioned from `note.rect`
 *    (canvas coords). Committing an edit (on blur) calls `setNoteText`
 *    (src/items) so the change is one undo entry.
 *  - **Image_Items** as `<img>` from the stored `dataURL`, sized by `image.rect`.
 *  - **Crops** as `<canvas>` re-rendered from the PDF at a resolution matching
 *    the crop's on-canvas display size (Req 4.4), via {@link renderCrop}
 *    (src/canvas/cropRender.ts — a small, self-contained sub-region render path
 *    that reuses the Safari area clamp without modifying src/pdf).
 *
 * ## Out of scope here (kept minimal on purpose)
 * Selection, move/resize handles, and Connector lines are the OverlayLayer
 * (task 13.2). Drag/resize *input* wiring (pointer → moveItem/resizeItem) is the
 * app shell (task 15.1). This layer only renders item **content** and wires
 * Note text editing. To avoid stealing pointer gestures from those later
 * layers, the ItemLayer container is `pointer-events: none`; individual Notes
 * re-enable pointer events only while actively being edited.
 *
 * ## Props, not stores (testability)
 * Items, the Camera, and the PDF document are passed as props so the component
 * is self-contained and testable without mounting the whole app. The default
 * `onNoteTextChange` delegates to the `setNoteText` store action, but a test
 * (or the app shell) can inject its own.
 */

import { useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { Camera, Crop, ImageItem, Note } from '../types';
import { setNoteText as setNoteTextAction } from '../items';
import { cameraTransform } from './transform';
import { renderCrop } from './cropRender';

export interface ItemLayerProps {
  /** Text notes in white space (canvas-coord rects). */
  readonly notes: readonly Note[];
  /** Image_Items in white space (canvas-coord rects, raster as data URL). */
  readonly images: readonly ImageItem[];
  /** Crops: source region in Page coords + canvas-coord placement. */
  readonly crops: readonly Crop[];
  /** The live Camera, shared by every layer. */
  readonly camera: Camera;
  /**
   * The open PDF.js document used to render Crop bitmaps, or `null` when no PDF
   * is open (Crops then show an empty placeholder). Supplied by the app shell
   * (task 15.1); taken as a prop so the layer is self-contained and testable.
   */
  readonly pdfDocument: PDFDocumentProxy | null;
  /**
   * Commit a Note text edit. Defaults to the `setNoteText` store action (one
   * undo entry); injectable for tests.
   */
  readonly onNoteTextChange?: (noteId: string, text: string) => void;
}

/**
 * The DOM item layer. Pure presentational component driven by its props; the
 * only store coupling is the default Note-edit commit, which is overridable.
 */
export function ItemLayer({
  notes,
  images,
  crops,
  camera,
  pdfDocument,
  onNoteTextChange = setNoteTextAction,
}: ItemLayerProps) {
  return (
    <div
      className="item-layer"
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        // The content layers below (Overlay/Ink) and the app shell own gestures;
        // Notes re-enable pointer events only while editing (see NoteView).
        pointerEvents: 'none',
      }}
    >
      <div
        className="item-layer__scene"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          transformOrigin: '0 0',
          transform: cameraTransform(camera),
          willChange: 'transform',
        }}
      >
        {images.map((image) => (
          <ImageView key={image.id} image={image} />
        ))}
        {crops.map((crop) => (
          <CropView key={crop.id} crop={crop} camera={camera} pdfDocument={pdfDocument} />
        ))}
        {notes.map((note) => (
          <NoteView key={note.id} note={note} onCommit={onNoteTextChange} />
        ))}
      </div>
    </div>
  );
}

/** Common absolute positioning in canvas coordinates for an item's rect. */
function rectStyle(rect: { x: number; y: number; width: number; height: number }) {
  return {
    position: 'absolute' as const,
    left: rect.x,
    top: rect.y,
    width: rect.width,
    height: rect.height,
  };
}

/** An Image_Item rendered from its data URL, sized by its canvas rect. */
function ImageView({ image }: { image: ImageItem }) {
  return (
    <img
      className="item-layer__image"
      src={image.dataURL}
      alt=""
      draggable={false}
      style={{
        ...rectStyle(image.rect),
        display: 'block',
        objectFit: 'fill',
        userSelect: 'none',
      }}
    />
  );
}

/**
 * A Note as a `contenteditable` box (Req 4.1). The box renders the stored text
 * and, on blur, commits any change via `onCommit` (→ `setNoteText`). Pointer
 * events are enabled only while the Note is focused so that, when not editing,
 * gestures pass through to the layers/app shell that own selection and
 * pan/zoom (those are wired in tasks 13.2 / 15.1).
 *
 * The editable element is uncontrolled: React sets `textContent` only when the
 * incoming prop differs from what's shown, so typing (and the caret) is never
 * disrupted by re-renders.
 */
function NoteView({
  note,
  onCommit,
}: {
  note: Note;
  onCommit: (noteId: string, text: string) => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [editing, setEditing] = useState(false);

  // Keep the DOM text in sync with the prop without clobbering the caret while
  // the user is typing: only write when the element is not focused and the text
  // actually differs.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!editing && el.textContent !== note.text) {
      el.textContent = note.text;
    }
  }, [note.text, editing]);

  return (
    <div
      ref={ref}
      className="item-layer__note"
      role="textbox"
      aria-label="Note"
      aria-multiline="true"
      tabIndex={0}
      contentEditable
      suppressContentEditableWarning
      onFocus={() => setEditing(true)}
      onBlur={(event) => {
        setEditing(false);
        const text = event.currentTarget.textContent ?? '';
        if (text !== note.text) {
          onCommit(note.id, text);
        }
      }}
      style={{
        ...rectStyle(note.rect),
        boxSizing: 'border-box',
        padding: 4,
        background: '#fff8e1',
        border: '1px solid #e0c86a',
        borderRadius: 2,
        font: '14px system-ui, sans-serif',
        color: '#222',
        overflow: 'hidden',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        outline: 'none',
        // Only editable Notes capture pointer input; the rest of the layer is
        // transparent to gestures (selection/drag are later tasks).
        pointerEvents: 'auto',
        cursor: 'text',
      }}
    />
  );
}

/**
 * A Crop rendered onto its own `<canvas>` from the source Page region at a
 * resolution matching its on-canvas display size (Req 4.4). The display width
 * in CSS pixels is the crop's canvas width times the Camera zoom; `renderCrop`
 * oversamples by the device pixel ratio and clamps to the Safari area limit.
 *
 * The canvas element itself is laid out at the crop's canvas-coordinate rect
 * (so the shared Camera transform places/scales it like every other item); its
 * backing-store resolution is independent and chosen for crispness. Re-render
 * is triggered when the source region, source page, or the display resolution
 * (zoom × width) changes. Caching / zoom-settle debouncing can be layered on in
 * a later refinement — for 13.1 it renders correctly on demand.
 */
function CropView({
  crop,
  camera,
  pdfDocument,
}: {
  crop: Crop;
  camera: Camera;
  pdfDocument: PDFDocumentProxy | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Display width in CSS pixels at the current zoom; used to pick the render
  // resolution so the crop stays sharp (Req 4.4).
  const displayWidthPx = Math.max(1, crop.rect.width * camera.zoom);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !pdfDocument) return;

    let cancelled = false;
    const pixelRatio =
      typeof globalThis.devicePixelRatio === 'number' ? globalThis.devicePixelRatio : 1;

    void renderCrop(
      pdfDocument,
      crop.sourcePageIndex,
      crop.sourceRect,
      displayWidthPx,
      pixelRatio,
    )
      .then((rendered) => {
        if (cancelled || !rendered) return;
        const target = canvasRef.current;
        if (!target) return;
        target.width = rendered.canvas.width;
        target.height = rendered.canvas.height;
        const ctx = target.getContext('2d');
        if (!ctx) return;
        ctx.clearRect(0, 0, target.width, target.height);
        ctx.drawImage(rendered.canvas as CanvasImageSource, 0, 0);
      })
      .catch((error: unknown) => {
        // eslint-disable-next-line no-console
        console.error(error);
      });

    return () => {
      cancelled = true;
    };
  }, [
    pdfDocument,
    crop.sourcePageIndex,
    crop.sourceRect.x,
    crop.sourceRect.y,
    crop.sourceRect.width,
    crop.sourceRect.height,
    displayWidthPx,
  ]);

  return (
    <canvas
      ref={canvasRef}
      className="item-layer__crop"
      style={{
        ...rectStyle(crop.rect),
        display: 'block',
        background: '#ffffff',
        border: '1px solid #d0d0d0',
        boxSizing: 'border-box',
      }}
    />
  );
}
