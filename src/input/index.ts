/**
 * Input module barrel. Import the Input_Router pure decision API from
 * `src/input` rather than from individual files so the module layout can change
 * without touching call sites. Stateful gesture machinery (palm-rejection
 * clock, pointer capture, flick/tap detection) lands in task 7.4.
 */

export type { PointerKind, Route, RouterContext } from './router';
export { classify, route } from './router';
