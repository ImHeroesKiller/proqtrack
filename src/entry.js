import '../assets/logo.js';

// Keep the entry point intentionally small. Brand rendering is owned by
// app.js / organization-branding.js; a document-wide MutationObserver here
// previously competed with first paint during bootstrap and route rendering.
await import('./bootstrap.js');
