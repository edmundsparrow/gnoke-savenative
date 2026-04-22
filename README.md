# gnoke-savenative

A self-healing native file write layer for browser-based apps.  
Mount a folder, write files, survive OS kills and reloads — automatically.  
Zero dependencies. Vanilla JS. Part of the [Gnoke Suite](https://edmundsparrow.netlify.app).

---

## The Problem

The File System Access API is powerful but fragile on mobile. A background OS kill,
a tab reload, or a stale stream from concurrent writes will silently drop your data.

**gnoke-savenative** solves this with a two-layer survival pipeline:

1. **Native write** — writes directly to the real filesystem via the File System Access API
2. **Shelf fallback** — if the native write fails for any reason, the content is immediately shelved in IndexedDB
3. **Auto-flush** — on the next `wake()`, the shelf is drained silently back to disk

No prompts. No manual recovery. No data loss.

---

## Install

```bash
npm install gnoke-savenative
```

Or use directly in any HTML file via CDN — no npm, no build step:

```html
<!-- ES module -->
<script type="module">
  import { saveNative } from 'https://cdn.jsdelivr.net/gh/edmundsparrow/gnoke-savenative/gnoke-savenative.js';
  import { openDB }     from 'https://unpkg.com/idb?module';
</script>

<!-- Or plain script tag — saveNative available globally on window -->
<script src="https://cdn.jsdelivr.net/gh/edmundsparrow/gnoke-savenative/gnoke-savenative.js"></script>
```

---

## Quick Start

```js
import { saveNative } from 'gnoke-savenative';
import { openDB }     from 'idb';

// 1. Mount (requires user gesture)
const handle = await saveNative.mount(openDB);
let workspace = { handle, db: await saveNative._db(openDB) };

// 2. Write
await saveNative.write(workspace, 'notes.txt', 'Hello world');

// 3. Wake after reload — auto-flushes any shelved writes
workspace = await saveNative.wake(openDB);
```

---

## API

### `saveNative.mount(openDB)`
Prompts the user to pick a folder. Stashes the `FileSystemDirectoryHandle` in IndexedDB.  
**Must be called from a user gesture** (click/tap).  
Returns the directory handle.

### `saveNative.wake(openDB)`
Restores the stashed handle from IndexedDB after a reload or OS kill.  
Requests permission if needed, then **auto-flushes the shelf silently**.  
Returns `{ handle, db }` workspace object.

### `saveNative.write(workspace, name, content)`
Writes `content` to a file named `name` in the mounted folder.  
Writes are **serialized per filename** — concurrent writes to the same file queue safely.  
If the native write fails, content is immediately shelved in IndexedDB.  
Empty content is ignored (never shelved).

### Lifecycle Hooks *(optional)*

```js
saveNative.onWriteFailure  = (name, err)            => { /* native write failed, shelved */ };
saveNative.onFlushProgress = (flushed, total)        => { /* shelf draining */ };
saveNative.onFlushComplete = (recoveredCount)        => { /* flush done */ };
```

Hooks give your UI visibility into recovery. Recovery itself is always automatic.

---

## Survival Flow

```
User picks folder
      ↓
  mount() — handle stashed in IndexedDB
      ↓
  write() — native write attempted
      ↓ (success)            ↓ (failure — OS kill, stale stream, permission)
  File on disk           Shelved in IndexedDB
                              ↓
                    User returns / reloads
                              ↓
                  wake() — handle restored
                              ↓
                  _flush() — shelf → disk
                              ↓
                      Files on disk ✓
```

---

## Mobile Notes

Tested on **Infinix** (Android, Chrome). The shelf is designed for the mobile reality:

- Background OS kills are not edge cases — the shelf catches them
- `wake()` re-requests permission transparently via the browser prompt
- Concurrent writes (e.g. autosave + manual save) are queue-safe per filename

---

## Browser Support

Requires the [File System Access API](https://caniuse.com/native-filesystem).  
Supported in Chrome/Edge 86+, Opera 72+.  
Not supported in Firefox or Safari (shelf-only fallback still works).

---

## License

MIT © Edmund Sparrow — [Gnoke Suite](https://edmundsparrow.netlify.app)

