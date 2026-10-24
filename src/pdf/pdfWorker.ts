/**
 * PDF.js worker wiring (design "PDF.js build choice: modern build").
 *
 * The modern `pdfjs-dist` build (`pdf.mjs` + `pdf.worker.min.mjs`) is used
 * because the Supported_Safari floor is 16.4+, so no legacy polyfills are
 * needed. The worker is bundled by Vite and served from the *same origin* as
 * the app -- never a third-party CDN (Req 10.5, Req 15.2, Req 15.3).
 *
 * Vite's `?worker` import compiles the worker as a module worker and returns a
 * constructor. We instantiate it and hand the resulting port to PDF.js via
 * `GlobalWorkerOptions.workerPort`, which is Vite's recommended same-origin
 * approach and avoids any URL/`workerSrc` resolution at runtime.
 *
 * Actual PDF loading/rendering is implemented in task 4.7; this module only
 * configures the worker so the import resolves and the worker is bundled.
 */

import { GlobalWorkerOptions } from 'pdfjs-dist';
// The `?worker` suffix tells Vite to bundle this as a Web Worker and export a
// constructor. The worker asset is emitted alongside the app and loaded from
// the same origin.
import PdfJsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?worker';

let configured = false;

/**
 * Configure PDF.js to use the bundled, same-origin worker. Idempotent: safe to
 * call multiple times; only the first call installs the worker port.
 */
export function configurePdfWorker(): void {
  if (configured) {
    return;
  }
  GlobalWorkerOptions.workerPort = new PdfJsWorker();
  configured = true;
}
