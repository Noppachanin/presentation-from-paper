# io/

Serializer, schema + structure validation, file open/save.

- `serializer.ts` — `serialize`/`deserialize` + `PresentationFile`, `FORMAT_VERSION`,
  `ValidationError`, `Result` (task 8.1).
- `fileIo.ts` — browser open/save with a file input and `<a download>` (no File
  System Access API): `savePresentation`, `buildPresentationBlob`,
  `loadPresentationFile`, `parsePresentationText`, `triggerDownload`,
  `readFileAsText` (task 8.6, Req 9.1, 9.5, 15.3).
- `reconcile.ts` — load-time PDF_Fingerprint reconciliation: `reconcile`,
  `reconcileOnContinue` (task 8.6, Req 9.6-9.9, 9.14).
- `url.ts` — Present_Mode URL-flag parsing: `isPresentModeRequested`
  (task 8.6, Req 10.8).

Import from the `../io` barrel rather than individual files.

Implemented in tasks 8.1, 8.6.
