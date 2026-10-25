/**
 * Translate Input_Router gesture events into Camera / ink / document actions
 * (task 15.1). This is the bulk of the input wiring the design assigns to the
 * app shell: `attachGestures` (src/input) emits high-level {@link GestureEvent}s
 * on the CaptureSurface, and this hook maps each to an effect.
 *
 * Wired here:
 *  - **pan / pinch → Camera** (Req 2.1, 2.2, 8.8): a one-finger drag pans; a
 *    two-finger gesture pans + zooms around the pinch midpoint. This runs in
 *    both Edit_Mode and Present_Mode, so free pan/zoom stays available while
 *    Step navigation does too (Req 8.8). Live pan/zoom is interrupt-safe: the
 *    camera transition loop is cancelled when the user grabs the Camera.
 *  - **tap / flick nav** (Req 8.2, 8.3, 8.12): the gesture layer already emits a
 *    `nav` event for Present_Mode tap-half / flick; we forward it to the App's
 *    next/prev.
 *  - **ink-draw** (Req 11.1, 14.x): accumulate an in-progress {@link InkStroke}
 *    from the routed points + the selected colour/width and pressure, repaint
 *    only the InkLayer while live (via `setInProgress`), and on end commit the
 *    stroke to Discussion_Ink (or Kept_Ink when the keep toggle is on),
 *    recording ONE history entry per stroke (Req 11.1).
 *  - **ink-erase** (Req 14.15): erase whole strokes within 12px at each move,
 *    recording one history entry per erase contact.
 *  - **edit create** (Req 3.1, 4.1): the `focus` and `note` tools create a
 *    Focus_Area / Note on pointer-up from the dragged / tapped region. Other
 *    edit interactions (image, crop, connector, select/move/resize) are marked
 *    with TODOs — they exceed the core wiring scope of 15.1 but the hook shape
 *    supports adding them.
 *
 * Coordinate handling: gesture `x`/`y` are screen (client) pixels relative to
 * the viewport. The CaptureSurface fills the surface container, whose top-left
 * is the viewport origin, so `screenToCanvas` with the live Camera converts
 * them to canvas coordinates for ink and item placement.
 */

import { useCallback, useEffect, useRef } from 'react';
import { attachGestures, type GestureContext, type GestureEvent } from '../input';
import { screenToCanvas, canvasToPage } from '../geometry';
import { eraseAt } from '../ink';
import { useDocumentStore, useHistoryStore, useSessionStore } from '../state';
import { addFocusArea, addNote } from '../items';
import { clampZoom } from '../camera';
import type { Camera, InkPoint, InkStroke, Point, Viewport } from '../types';

/** Collected point in SCREEN coordinates with pressure, for a live gesture. */
interface ScreenPoint {
  x: number;
  y: number;
  pressure: number;
}

/** The parameters the gesture wiring needs from the App each render. */
export interface GestureWiringOptions {
  /** The capture surface element (from CaptureSurface `onSurfaceReady`). */
  surface: HTMLElement | null;
  /** Current viewport size (screen px). */
  getViewport: () => Viewport;
  /** The selected ink colour (from the Ink_Palette). */
  getInkColor: () => string;
  /** The selected ink width in screen px (from the Ink_Palette). */
  getInkWidth: () => number;
  /** Repaint only the InkLayer with the in-progress stroke (or null to clear). */
  setInProgress: (stroke: InkStroke | null) => void;
  /** Forward Present_Mode tap/flick navigation to the App. */
  onNav: (direction: 'next' | 'prev') => void;
  /** Report input activity (resets the step-indicator fade). */
  onActivity?: () => void;
  /** Cancel a running Camera transition when the user grabs the Camera. */
  onCameraGrabbed?: () => void;
}

/**
 * Attach gesture handling to the capture surface. Re-attaches when the surface
 * element changes; all live state (per-gesture points, pan anchors) is kept in
 * refs so the single attached controller is stable.
 */
export function useGestureWiring(options: GestureWiringOptions): void {
  const { surface } = options;

  // Keep the latest option callbacks in a ref so the attach effect does not
  // need them as dependencies (avoids re-attaching listeners on every render).
  const optsRef = useRef(options);
  optsRef.current = options;

  // --- Per-gesture live state (refs, not React state: no re-render churn) ---

  /** Active pan/pinch pointers keyed by pointerId → last screen position. */
  const cameraPointers = useRef<Map<number, Point>>(new Map());
  /** Camera at the start of the current pan/pinch, for delta application. */
  const cameraStart = useRef<Camera | null>(null);
  /** Anchor for a one-finger pan: screen point + canvas point under it. */
  const panAnchor = useRef<{ screen: Point; canvas: Point } | null>(null);
  /** Anchor for a two-finger pinch: midpoint + distance + canvas-at-midpoint. */
  const pinchAnchor = useRef<{
    midpoint: Point;
    distance: number;
    canvasAtMid: Point;
  } | null>(null);

  /** Points of the live ink stroke, in screen coords, keyed by pointerId. */
  const inkPoints = useRef<Map<number, ScreenPoint[]>>(new Map());

  // ---- Camera helpers -----------------------------------------------------

  /** Apply a one-finger pan so the anchored canvas point stays under the finger. */
  const applyPan = useCallback(() => {
    const anchor = panAnchor.current;
    if (!anchor) return;
    const only = [...cameraPointers.current.values()][0];
    if (!only) return;
    const cam = useSessionStore.getState().camera;
    // Keep anchor.canvas under the current screen point: pan = canvas - screen/zoom.
    const panX = anchor.canvas.x - only.x / cam.zoom;
    const panY = anchor.canvas.y - only.y / cam.zoom;
    useSessionStore.getState().setCamera({ panX, panY, zoom: cam.zoom });
  }, []);

  /** Apply a two-finger pinch: zoom around the midpoint and pan with it. */
  const applyPinch = useCallback(() => {
    const anchor = pinchAnchor.current;
    if (!anchor) return;
    const pts = [...cameraPointers.current.values()];
    if (pts.length < 2) return;
    const [a, b] = pts;
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const distance = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const startCam = cameraStart.current ?? useSessionStore.getState().camera;
    const scale = distance / (anchor.distance || 1);
    const zoom = clampZoom(startCam.zoom * scale);
    // Keep the canvas point that was under the start midpoint under the current
    // midpoint: pan = canvasAtMid - currentMid/zoom.
    const panX = anchor.canvasAtMid.x - mid.x / zoom;
    const panY = anchor.canvasAtMid.y - mid.y / zoom;
    useSessionStore.getState().setCamera({ panX, panY, zoom });
  }, []);

  /** (Re)initialise the pan/pinch anchors from the current pointer set. */
  const resyncCameraAnchors = useCallback(() => {
    const cam = useSessionStore.getState().camera;
    const pts = [...cameraPointers.current.values()];
    cameraStart.current = { ...cam };
    if (pts.length === 1) {
      pinchAnchor.current = null;
      panAnchor.current = {
        screen: { ...pts[0] },
        canvas: screenToCanvas(pts[0], cam),
      };
    } else if (pts.length >= 2) {
      panAnchor.current = null;
      const [a, b] = pts;
      const midpoint = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      pinchAnchor.current = {
        midpoint,
        distance: Math.hypot(b.x - a.x, b.y - a.y) || 1,
        canvasAtMid: screenToCanvas(midpoint, cam),
      };
    } else {
      panAnchor.current = null;
      pinchAnchor.current = null;
    }
  }, []);

  // ---- Ink helpers --------------------------------------------------------

  /** Build an InkStroke from screen points at the current Camera. */
  const buildStroke = useCallback(
    (screenPts: ScreenPoint[]): InkStroke => {
      const cam = useSessionStore.getState().camera;
      const color = optsRef.current.getInkColor();
      const widthScreen = optsRef.current.getInkWidth();
      const points: InkPoint[] = screenPts.map((p) => {
        const c = screenToCanvas({ x: p.x, y: p.y }, cam);
        return { x: c.x, y: c.y, pressure: p.pressure };
      });
      return {
        points,
        color,
        // Store width in canvas units so it scales with zoom (Req 14.5/14.6).
        width: widthScreen / cam.zoom,
        kept: useSessionStore.getState().keepInkToggle,
      };
    },
    [],
  );

  // ---- Gesture dispatch ---------------------------------------------------

  const handleGesture = useCallback(
    (event: GestureEvent) => {
      const o = optsRef.current;
      o.onActivity?.();

      switch (event.type) {
        case 'nav': {
          o.onNav(event.direction);
          return;
        }
        case 'freeze-camera': {
          // A pen cancelled an in-progress touch gesture: drop the camera
          // gesture state so a lingering finger does not keep panning.
          cameraPointers.current.clear();
          panAnchor.current = null;
          pinchAnchor.current = null;
          cameraStart.current = null;
          return;
        }
        case 'begin': {
          handleBegin(event);
          return;
        }
        case 'move': {
          handleMove(event);
          return;
        }
        case 'end': {
          handleEnd(event);
          return;
        }
        default:
          return;
      }
    },
    // handlers below are stable closures over refs
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const handleBegin = useCallback(
    (event: Extract<GestureEvent, { type: 'begin' }>) => {
      switch (event.route.kind) {
        case 'pan':
        case 'pinch': {
          optsRef.current.onCameraGrabbed?.();
          cameraPointers.current.set(event.pointerId, { x: event.x, y: event.y });
          resyncCameraAnchors();
          return;
        }
        case 'ink-draw': {
          inkPoints.current.set(event.pointerId, [
            { x: event.x, y: event.y, pressure: event.pressure },
          ]);
          optsRef.current.setInProgress(
            buildStroke(inkPoints.current.get(event.pointerId)!),
          );
          return;
        }
        case 'ink-erase': {
          // Erase at the contact point immediately (one contact == one entry).
          eraseContact(event.x, event.y, /* newContact */ true);
          return;
        }
        case 'edit':
          // Edit create/select handled on end; record the start point.
          editStart.current = { x: event.x, y: event.y, pointerId: event.pointerId };
          return;
        default:
          return;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [buildStroke, resyncCameraAnchors],
  );

  const handleMove = useCallback(
    (event: Extract<GestureEvent, { type: 'move' }>) => {
      switch (event.route.kind) {
        case 'pan':
        case 'pinch': {
          if (!cameraPointers.current.has(event.pointerId)) return;
          cameraPointers.current.set(event.pointerId, { x: event.x, y: event.y });
          if (cameraPointers.current.size >= 2) {
            applyPinch();
          } else {
            applyPan();
          }
          return;
        }
        case 'ink-draw': {
          const pts = inkPoints.current.get(event.pointerId);
          if (!pts) return;
          pts.push({ x: event.x, y: event.y, pressure: event.pressure });
          optsRef.current.setInProgress(buildStroke(pts));
          return;
        }
        case 'ink-erase': {
          eraseContact(event.x, event.y, /* newContact */ false);
          return;
        }
        default:
          return;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [applyPan, applyPinch, buildStroke],
  );

  const handleEnd = useCallback(
    (event: Extract<GestureEvent, { type: 'end' }>) => {
      switch (event.route.kind) {
        case 'pan':
        case 'pinch': {
          cameraPointers.current.delete(event.pointerId);
          if (cameraPointers.current.size === 0) {
            panAnchor.current = null;
            pinchAnchor.current = null;
            cameraStart.current = null;
          } else {
            // A finger lifted mid-pinch: re-anchor to the remaining pointer(s).
            resyncCameraAnchors();
          }
          return;
        }
        case 'ink-draw': {
          const pts = inkPoints.current.get(event.pointerId) ?? [];
          inkPoints.current.delete(event.pointerId);
          optsRef.current.setInProgress(null);
          if (pts.length === 0) return;
          const stroke = buildStroke(pts);
          commitStroke(stroke);
          return;
        }
        case 'ink-erase': {
          // Each contact already recorded on begin/move via eraseContact; end
          // closes the contact so the next down starts a new history entry.
          eraseContactOpen.current = false;
          return;
        }
        case 'edit': {
          handleEditEnd(event);
          editStart.current = null;
          return;
        }
        default:
          return;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [buildStroke, resyncCameraAnchors],
  );

  // ---- Ink commit ---------------------------------------------------------

  /** Commit a finished stroke as one undo unit (Req 11.1). */
  const commitStroke = useCallback((stroke: InkStroke) => {
    if (stroke.kept) {
      // Kept_Ink is persisted → record through history (undoable, Req 11.1/11.6).
      useHistoryStore.getState().recordEdit('draw ink', (draft) => {
        draft.keptInk.push(stroke);
      });
    } else {
      // Discussion_Ink is transient session state (never persisted, Req 9.13).
      useSessionStore.setState((s) => ({ discussionInk: [...s.discussionInk, stroke] }));
    }
  }, []);

  // ---- Eraser -------------------------------------------------------------

  /** Whether an erase contact is currently open (one history entry per contact). */
  const eraseContactOpen = useRef(false);

  const eraseContact = useCallback((screenX: number, screenY: number, newContact: boolean) => {
    const cam = useSessionStore.getState().camera;
    const point = screenToCanvas({ x: screenX, y: screenY }, cam);

    // Erase from Kept_Ink (persisted, undoable) as one entry per contact.
    const kept = useDocumentStore.getState().keptInk;
    const keptResult = eraseAt(kept, point, cam.zoom);
    if (keptResult.removed.length > 0) {
      useHistoryStore.getState().recordEdit('erase ink', (draft) => {
        const after = eraseAt(draft.keptInk, point, cam.zoom);
        draft.keptInk = after.remaining;
      });
    }

    // Erase from Discussion_Ink (transient session state, not undoable).
    useSessionStore.setState((s) => {
      const res = eraseAt(s.discussionInk, point, cam.zoom);
      return res.removed.length > 0 ? { discussionInk: res.remaining } : {};
    });

    if (newContact) eraseContactOpen.current = true;
  }, []);

  // ---- Edit tools (core: focus + note; others TODO) -----------------------

  /** Start of the current edit drag, screen coords. */
  const editStart = useRef<{ x: number; y: number; pointerId: number } | null>(null);

  const handleEditEnd = useCallback((event: Extract<GestureEvent, { type: 'end' }>) => {
    const start = editStart.current;
    if (!start) return;
    const cam = useSessionStore.getState().camera;
    const tool = useSessionStore.getState().activeTool;
    // The last collected point is the drag end; fall back to the start.
    const last = event.points[event.points.length - 1] ?? { x: start.x, y: start.y };

    if (tool === 'focus') {
      createFocusFromDrag(cam, start, last);
      return;
    }
    if (tool === 'note') {
      createNoteFromPoint(cam, { x: last.x, y: last.y });
      return;
    }
    // TODO(15.1 scope): image / crop / connector creation and select / move /
    // resize of existing items are not wired here. The gesture pipeline and
    // the item actions (addImageItem, addCrop, addConnector, moveItem,
    // resizeItem) exist; a future task maps `edit` drags on existing items to
    // selection + move/resize and the image/crop/connector tools to their
    // creation flows (which also need the oversized-image dialog and a
    // crop-region picker).
  }, []);

  /** Create a Focus_Area from a drag over a page (Req 3.1, 3.3, 3.4). */
  const createFocusFromDrag = useCallback(
    (cam: Camera, start: { x: number; y: number }, end: { x: number; y: number }) => {
      const startCanvas = screenToCanvas(start, cam);
      const endCanvas = screenToCanvas({ x: end.x, y: end.y }, cam);
      const pages = useDocumentStore.getState().pages;
      // Pick the page the drag START lands on.
      const page = pages.find(
        (p) =>
          startCanvas.x >= p.rect.x &&
          startCanvas.x <= p.rect.x + p.rect.width &&
          startCanvas.y >= p.rect.y &&
          startCanvas.y <= p.rect.y + p.rect.height,
      );
      if (!page) return;
      const a = canvasToPage(startCanvas, page);
      const b = canvasToPage(endCanvas, page);
      const rectPage = {
        x: Math.min(a.x, b.x),
        y: Math.min(a.y, b.y),
        width: Math.abs(b.x - a.x),
        height: Math.abs(b.y - a.y),
      };
      const screenWidth = Math.abs(end.x - start.x);
      const screenHeight = Math.abs(end.y - start.y);
      // addFocusArea discards drags below 8 screen px itself (Req 3.3).
      addFocusArea(page.pageIndex, rectPage, screenWidth, screenHeight);
    },
    [],
  );

  /** Create a Note at a canvas point (Req 4.1). */
  const createNoteFromPoint = useCallback((cam: Camera, screenPoint: Point) => {
    const canvas = screenToCanvas(screenPoint, cam);
    // A default note box in canvas units (scaled so it is a reasonable screen size).
    const w = 160 / cam.zoom;
    const h = 80 / cam.zoom;
    addNote({ x: canvas.x, y: canvas.y, width: w, height: h }, '');
  }, []);

  // ---- Attach / detach ----------------------------------------------------

  useEffect(() => {
    if (!surface) return;
    const getContext = (): GestureContext => ({
      mode: useSessionStore.getState().mode,
      activeTool: useSessionStore.getState().activeTool,
      viewport: optsRef.current.getViewport(),
    });
    const detach = attachGestures({
      surface,
      getContext,
      onGesture: handleGesture,
    });
    return () => {
      detach();
      // Clear any lingering gesture state on detach.
      cameraPointers.current.clear();
      inkPoints.current.clear();
      panAnchor.current = null;
      pinchAnchor.current = null;
      cameraStart.current = null;
      optsRef.current.setInProgress(null);
    };
  }, [surface, handleGesture]);
}
