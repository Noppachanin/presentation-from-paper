# state/

Zustand stores (document, session) and the undo/redo history command stack.

- `documentStore.ts` — persisted `DocumentState` (task 10.1).
- `sessionStore.ts` — transient session state + the live Camera (task 10.1).
- `history.ts` — inverse-able command stack (before/after snapshots), `recordEdit` / `undo` / `redo` / `applyWithoutHistory`, capacity ≥ 50 (task 10.2).

Implemented in tasks 10.1, 10.2.
