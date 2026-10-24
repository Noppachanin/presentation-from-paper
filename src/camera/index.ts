/**
 * Camera service barrel. Import the camera model and transition helpers from
 * `src/camera` rather than the individual files so the internal layout can
 * change without touching call sites.
 */

export {
  MIN_ZOOM,
  MAX_ZOOM,
  FIT_MARGIN,
  MIN_DURATION_MS,
  MAX_DURATION_MS,
  clampZoom,
  cameraForTarget,
  transitionDuration,
  easeInOut,
  needsZoomOutArc,
  interpolateCamera,
  startTransition,
  sampleTransition,
  instantTransition,
} from './camera';
export type { CameraTransition } from './camera';
