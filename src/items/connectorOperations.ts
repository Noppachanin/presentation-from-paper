/**
 * Pure Connector operations (Req 5.1–5.5).
 *
 * A Connector links a White_Space_Item to a Focus_Area (Req 5.1) or, for the
 * auto-Connector created with a Crop, the Crop to its source Page region (Req
 * 5.2). Connectors store only two ids (`fromItemId`, `toTargetId`); their
 * rendered endpoints are **derived** every frame from the two targets' current
 * canvas rectangles via {@link computeConnectorEndpoints}, so moving or
 * resizing either end updates the line with no stored-endpoint bookkeeping (Req
 * 5.3). Endpoints lie on each target's nearest edge (Req 5.5), delegating to
 * the geometry service's `nearestEdgePointsBetweenRects`.
 *
 * Like `itemOperations.ts`, everything here is a pure function over a draft or
 * over plain state — no store, no DOM — so it is directly testable. The
 * store-facing wrappers (one history entry per action) live in `itemActions.ts`.
 */

import type {
  Connector,
  DocumentState,
  RectCanvas,
} from '../types';
import type { EdgePointPair } from '../geometry';
import { nearestEdgePointsBetweenRects, pageToCanvas } from '../geometry';
import { newId } from './ids';

/**
 * Create a Connector between a White_Space_Item and a Focus_Area (Req 5.1).
 *
 * `fromItemId` is the white-space item (Note / Image_Item / Crop) and
 * `toTargetId` is the Focus_Area. The function is permissive about which id is
 * which — it only records the pair — but it does guard against creating a
 * Connector to a target that resolves to no rectangle, and against duplicate
 * Connectors between the same pair. Returns the new Connector id, or
 * `undefined` when it was not created.
 */
export function createConnector(
  draft: DocumentState,
  fromItemId: string,
  toTargetId: string,
): string | undefined {
  if (fromItemId === toTargetId) {
    return undefined;
  }
  // Both ends must resolve to a rectangle for the Connector to be meaningful.
  if (
    resolveTargetRect(draft, fromItemId) === undefined ||
    resolveTargetRect(draft, toTargetId) === undefined
  ) {
    return undefined;
  }
  // Avoid duplicates (same unordered pair).
  const exists = draft.connectors.some(
    (c) =>
      (c.fromItemId === fromItemId && c.toTargetId === toTargetId) ||
      (c.fromItemId === toTargetId && c.toTargetId === fromItemId),
  );
  if (exists) {
    return undefined;
  }
  const connector: Connector = { id: newId(), fromItemId, toTargetId };
  draft.connectors.push(connector);
  return connector.id;
}

/**
 * Delete a Connector, leaving the connected items unchanged (Req 5.4). No-op if
 * the id matches no Connector.
 */
export function deleteConnector(draft: DocumentState, connectorId: string): void {
  draft.connectors = draft.connectors.filter((c) => c.id !== connectorId);
}

/**
 * Remove every Connector that references `itemId` on either end. Used by the
 * Focus_Area / White_Space_Item deletion cascades (Req 3.6, 4.8) so no
 * Connector is left dangling.
 */
export function removeConnectorsReferencing(draft: DocumentState, itemId: string): void {
  draft.connectors = draft.connectors.filter(
    (c) => c.fromItemId !== itemId && c.toTargetId !== itemId,
  );
}

/**
 * Resolve the canvas-space rectangle of a Connector target by id.
 *
 * White-space items (Notes, Image_Items, Crops) already store a canvas rect.
 * A Focus_Area stores its rect in Page coordinates, so it is converted to
 * canvas via the page placement. A Crop referenced as `toTargetId === cropId`
 * (the auto-Connector's source end, Req 5.2) resolves to the Crop's **source
 * region on the Page**, converted from Page to canvas coordinates.
 *
 * Returns `undefined` when the id matches nothing, or when a page-based target
 * has no placement yet.
 */
export function resolveTargetRect(
  draft: DocumentState,
  id: string,
  options?: { readonly asCropSource?: boolean },
): RectCanvas | undefined {
  // Crop source region (auto-Connector end) takes precedence when requested.
  const cropForSource = draft.crops.find((c) => c.id === id);
  if (cropForSource !== undefined && options?.asCropSource) {
    return pageRectToCanvas(
      draft,
      cropForSource.sourcePageIndex,
      cropForSource.sourceRect,
    );
  }

  const note = draft.notes.find((n) => n.id === id);
  if (note !== undefined) return note.rect;

  const image = draft.images.find((i) => i.id === id);
  if (image !== undefined) return image.rect;

  const crop = draft.crops.find((c) => c.id === id);
  if (crop !== undefined) return crop.rect;

  const focus = draft.focusAreas.find((f) => f.id === id);
  if (focus !== undefined) {
    return pageRectToCanvas(draft, focus.pageIndex, focus.rect);
  }

  return undefined;
}

/** Convert a Page-coordinate rectangle to canvas coordinates via its page placement. */
function pageRectToCanvas(
  draft: DocumentState,
  pageIndex: number,
  rect: { x: number; y: number; width: number; height: number },
): RectCanvas | undefined {
  const page = draft.pages.find((p) => p.pageIndex === pageIndex);
  if (page === undefined) {
    return undefined;
  }
  const topLeft = pageToCanvas({ x: rect.x, y: rect.y }, page);
  const bottomRight = pageToCanvas(
    { x: rect.x + rect.width, y: rect.y + rect.height },
    page,
  );
  return {
    x: topLeft.x,
    y: topLeft.y,
    width: bottomRight.x - topLeft.x,
    height: bottomRight.y - topLeft.y,
  };
}

/**
 * Compute a Connector's live endpoints in canvas coordinates (Req 5.3, 5.5).
 *
 * Both ends are resolved to canvas rectangles and the endpoints are placed on
 * each rectangle's nearest edge via the geometry service. The auto-Connector of
 * a Crop (where `fromItemId === toTargetId === cropId`, Req 5.2) is detected and
 * its `to` end resolves to the Crop's **source region on the Page** rather than
 * the Crop's placement, so the line runs from the Crop to the paper.
 *
 * Returns `undefined` when either end cannot be resolved (e.g. a missing page
 * placement) so the caller can skip drawing that Connector.
 */
export function computeConnectorEndpoints(
  doc: DocumentState,
  connector: Connector,
): EdgePointPair | undefined {
  const isCropAutoConnector =
    connector.fromItemId === connector.toTargetId &&
    doc.crops.some((c) => c.id === connector.fromItemId);

  const fromRect = resolveTargetRect(doc, connector.fromItemId);
  const toRect = isCropAutoConnector
    ? resolveTargetRect(doc, connector.toTargetId, { asCropSource: true })
    : resolveTargetRect(doc, connector.toTargetId);

  if (fromRect === undefined || toRect === undefined) {
    return undefined;
  }
  return nearestEdgePointsBetweenRects(fromRect, toRect);
}
