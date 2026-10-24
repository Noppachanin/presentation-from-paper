# items/

Focus_Area, Note, Image_Item, Crop, and Connector logic (task 11.1).

## Design: pure recipes + thin store wrappers

The module is split so the core logic is testable without React or Zustand:

- **`itemOperations.ts` / `connectorOperations.ts`** — pure functions over an
  Immer draft of `DocumentState`: `(draft, ...args) => void | string(newId)`.
  No store, no DOM. These are what the property/unit tests (11.2–11.4) drive
  directly through `immer.produce`, and what the Sequence model (11.5) reuses.
- **`itemActions.ts`** — thin store wrappers. Each is **one user action == one
  undo entry**, calling `useHistoryStore.getState().recordEdit(label, recipe)`
  exactly once. The UI (task 14) calls these.
- **`validation.ts`** — image type/size validation returning a typed result the
  UI acts on (it never opens a dialog itself).
- **`ids.ts`** — `newId()` (`crypto.randomUUID` with a fallback).

## Coordinate spaces

- Focus_Areas store their rect in **Page coordinates** (Req 3.1), clamped to the
  page (Req 3.4).
- Notes / Image_Items / Crops store placement in **canvas coordinates**; a Crop
  also stores a **Page-coordinate** source rect.
- The 8px Focus_Area minimum (Req 3.3) is a **screen-pixel** threshold: callers
  pass the drag's screen width/height alongside the page rect, documented on
  `createFocusArea`.

## Step appending (shared with task 11.5)

Creating any item appends a Step (Req 3.2, 4.7) via the exported `appendStep`
helper. **Task 11.5 owns reorder / position-labels / navigation and must reuse
`appendStep`** rather than appending a second Step.

## Connectors

Connectors store only two ids; endpoints are derived every frame by
`computeConnectorEndpoints` using the geometry service's
`nearestEdgePointsBetweenRects` (Req 5.3, 5.5). Creating a Crop also creates an
auto-Connector linking it to its source Page region (Req 5.2). Deletion cascades
(`deleteFocusArea`, `deleteWhiteSpaceItem`) remove the referencing Step and all
attached Connectors (Req 3.6, 4.8); `deleteConnector` leaves items unchanged
(Req 5.4).
