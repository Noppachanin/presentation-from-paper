import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { configurePdfWorker } from '../pdf/pdfWorker';

// Install the bundled, same-origin PDF.js worker before any PDF work happens
// (actual PDF loading is task 4.7). This also ensures the worker is emitted as
// a same-origin asset by the build (Req 10.5).
configurePdfWorker();

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element #root not found');
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
