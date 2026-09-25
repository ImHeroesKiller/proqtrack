import '../assets/logo.js';

// Keep the entry point intentionally small. Brand rendering is owned by
// app.js / organization-branding.js; startup DOM observation was removed
// so bootstrap and first paint do not compete with a document-wide watcher.
await import('./bootstrap.js');
