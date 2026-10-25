# sequence/

The Sequence model and Step navigation (task 11.5).

Owns everything that happens to a Step *after* it is created. Item creation
already appends a Step (`items/itemOperations.ts` `appendStep`, called by
`createFocusArea` / `createNote` / `createImageItem` / `createCrop`, Req 3.2 /
4.7), so this module never double-appends — it re-exports `appendStep` so any
future append path reuses the one shared helper.

## Layers

- **`sequenceModel.ts`** — pure recipes over an Immer `DocumentState` draft and
  pure selectors over a `DocumentState`. No store or DOM dependency, so the
  property/unit tests (tasks 11.6/11.7) drive them directly.
  - `reorderStep(draft, from, to)` — move a Step within the Sequence (Req 6.2).
  - `deleteStepFromSequence(draft, stepId)` — remove the Step but KEEP the
    referenced item on the canvas (Req 6.4); the opposite of the item-deleting
    recipes in `items/`.
  - `setSpeakerNote(draft, stepId, text)` / `getSpeakerNote(doc, stepId)` —
    store/read a Step's speaker note (Req 6.5/6.6).
  - `focusAreaLabel(doc, focusId)` — a Focus_Area's position label is its
    1-based index in the Sequence (design Property 7). The label is **derived,
    never stored**, so reordering updates labels implicitly (Req 6.2).
  - `stepTargetRect(doc, step)` — resolve a Step's item to a canvas-space rect
    for click-to-animate (Req 6.3): Focus_Areas via `pageToCanvas`; Notes /
    Images / Crops use their canvas rect directly.
  - `cameraForStep(doc, step, viewport)` — thin wrapper over the camera
    service's `cameraForTarget(stepTargetRect, viewport)`. The animated rAF
    transition loop is task 15.1, not here.

- **`navigation.ts`** — next/previous Step with end clamping (Req 8.5/8.6).
  `currentStepIndex` is transient Session state, so navigation goes through the
  Session store setter and is **excluded from undo history** (like Camera moves,
  Req 11.5). Pure helpers (`clampStepIndex`, `nextStepIndex`, `prevStepIndex`,
  `canNext`, `canPrev`) hold the clamping math; `nextStep()` / `prevStep()` are
  the store-driven wrappers. Next on the last Step and prev on the first Step
  keep the index; an empty Sequence normalises to `0`.

- **`sequenceActions.ts`** — thin store wrappers (`moveStep`,
  `removeStepFromSequence`, `setStepSpeakerNote`) that apply one recipe per user
  action through `useHistoryStore.recordEdit`, so each is a single undo unit
  (consistent with `items/itemActions.ts`).

Import from `../sequence` (or `@/sequence`); do not reach into the files.

Tests live in tasks 11.6/11.7.
