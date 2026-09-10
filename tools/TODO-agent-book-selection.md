# TODO: agent backend ignores the requested Nielsen book

`api/agent/chat.mjs` accepts `context.nielsenBook` but only interpolates it into the system prompt text (line ~346); it never selects a data file.
`loadNielsenData()` (line ~51) reads one hardcoded path and caches the result in a single module-level variable for the life of the serverless instance.
So every request is served the hardcoded book regardless of what it asks for — and worse, the prompt tells the model a book name that may not match the data its tools return.
Fix: replace the single path and cache with a book-id keyed loader map mirroring `BUNDLED_BOOKS` in index.html, holding a per-book cache, and resolve it from `context.nielsenBook` with the current default as the fallback.
Until then `api/agent/test.http` deliberately sends no `nielsenBook` field, so the fixtures do not imply a capability the backend lacks.
Related: book selection is not persisted across reloads — `_selectedBundledBook` resets to the default on every load, which is by design for now, so the app always opens on the current book.
