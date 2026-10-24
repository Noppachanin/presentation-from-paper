# pdf/

PDF_Loader, page windowing, render-scale clamp, fingerprint.

Uses the modern `pdfjs-dist` build (`pdfjs-dist/build/pdf.mjs` + `pdf.worker.mjs`),
bundled via Vite so the worker is served from the same origin.

Implemented in tasks 4.1, 4.4, 4.7 (worker wiring in task 1.3).
