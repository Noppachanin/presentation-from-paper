/**
 * The set of editing and ink tools selectable in the Toolbar / Ink_Palette.
 * Routing decisions in the Input_Router depend on the active tool (design
 * "Input_Router").
 */
export type Tool =
  | 'pan'
  | 'focus'
  | 'note'
  | 'image'
  | 'crop'
  | 'connector'
  | 'ink'
  | 'eraser';
